/**
 * Extracts context from C1 response shapes for API calls
 * @param {Editor} editor - The tldraw editor instance
 * @returns {string} - Additional context string
 */
export function extractC1ShapeContext(editor) {
  const shapes = editor.getCurrentPageShapes();
  const c1Shapes = shapes.filter(
    (shape) => shape.type === 'c1-response' && shape.props.c1Response
  );

  if (c1Shapes.length === 0) {
    return '';
  }

  // Extract prompts and responses from C1 shapes
  const contextParts = c1Shapes.map((shape) => {
    const prompt = shape.props.prompt || '';
    const response = shape.props.c1Response || '';
    return `Q: ${prompt}\nA: ${response.substring(0, 500)}...`; // Limit response length
  });

  return contextParts.join('\n\n');
}

