from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import os
from motor.motor_asyncio import AsyncIOMotorClient
import json
from datetime import datetime, timezone
import uuid
from typing import Dict, List, Set, Optional
from pydantic import BaseModel
import aiofiles

app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB setup
mongo_url = os.environ.get('MONGO_URL')
client = AsyncIOMotorClient(mongo_url)
db = client.tldraw_canvas

# In-memory connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        
    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = set()
        self.active_connections[room_id].add(websocket)
        
    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.active_connections:
            self.active_connections[room_id].discard(websocket)
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]
    
    async def broadcast(self, room_id: str, message: dict, exclude: WebSocket = None):
        if room_id not in self.active_connections:
            return
        
        disconnected = set()
        for connection in self.active_connections[room_id]:
            if connection != exclude:
                try:
                    await connection.send_json(message)
                except Exception:
                    disconnected.add(connection)
        
        # Clean up disconnected connections
        for conn in disconnected:
            self.active_connections[room_id].discard(conn)

manager = ConnectionManager()

# Models
class SnapshotUpdate(BaseModel):
    snapshot: dict

@app.get("/")
async def root():
    return {"message": "tldraw collaboration server is running"}

@app.get("/api/health")
async def health_check():
    return {"status": "ok"}

@app.get("/api/sync/rooms/{room_id}/snapshot")
async def get_snapshot(room_id: str):
    """Get the latest snapshot for a room"""
    try:
        room = await db.rooms.find_one({"room_id": room_id})
        if not room:
            # Create default empty snapshot
            default_snapshot = {
                "store": {},
                "schema": {
                    "schemaVersion": 2,
                    "sequences": {}
                }
            }
            
            new_room = {
                "room_id": room_id,
                "snapshot": default_snapshot,
                "version": 0,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
            
            await db.rooms.insert_one(new_room)
            return {"snapshot": default_snapshot, "version": 0}
        
        return {"snapshot": room.get("snapshot", {}), "version": room.get("version", 0)}
    except Exception as e:
        print(f"Error getting snapshot: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sync/rooms/{room_id}/apply")
async def apply_updates(room_id: str, update: SnapshotUpdate):
    """Apply updates to the room snapshot"""
    try:
        room = await db.rooms.find_one({"room_id": room_id})
        
        if not room:
            # Create new room with this snapshot
            new_room = {
                "room_id": room_id,
                "snapshot": update.snapshot,
                "version": 1,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
            await db.rooms.insert_one(new_room)
            return {"success": True, "version": 1}
        
        # Update existing room
        new_version = room.get("version", 0) + 1
        await db.rooms.update_one(
            {"room_id": room_id},
            {
                "$set": {
                    "snapshot": update.snapshot,
                    "version": new_version,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        
        # Also store in operations log for recovery
        operation = {
            "room_id": room_id,
            "op_id": str(uuid.uuid4()),
            "snapshot": update.snapshot,
            "version": new_version,
            "timestamp": datetime.now(timezone.utc)
        }
        await db.operations.insert_one(operation)
        
        return {"success": True, "version": new_version}
    except Exception as e:
        print(f"Error applying update: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/api/ws/rooms/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await manager.connect(websocket, room_id)
    
    try:
        # Send initial connection confirmation
        await websocket.send_json({
            "type": "connected",
            "room_id": room_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        
        # Broadcast user joined
        await manager.broadcast(room_id, {
            "type": "user_joined",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }, exclude=websocket)
        
        while True:
            data = await websocket.receive_json()
            
            # Handle different message types
            msg_type = data.get("type")
            
            if msg_type == "update":
                # Broadcast updates to all other clients
                await manager.broadcast(room_id, data, exclude=websocket)
                
            elif msg_type == "cursor":
                # Broadcast cursor position
                await manager.broadcast(room_id, data, exclude=websocket)
                
            elif msg_type == "presence":
                # Broadcast presence updates
                await manager.broadcast(room_id, data, exclude=websocket)
                
            elif msg_type == "snapshot_request":
                # Client is requesting the latest snapshot
                room = await db.rooms.find_one({"room_id": room_id})
                if room:
                    await websocket.send_json({
                        "type": "snapshot",
                        "snapshot": room.get("snapshot", {}),
                        "version": room.get("version", 0)
                    })
                    
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)
        # Broadcast user left
        await manager.broadcast(room_id, {
            "type": "user_left",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket, room_id)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
