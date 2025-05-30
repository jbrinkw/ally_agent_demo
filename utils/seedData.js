/**
 * Seed Data Utility
 * 
 * Handles seeding the database with example tools and tool groups.
 */

/**
 * Seed database with example tools and tool groups
 */
export function seedDatabase(db) {
  // Example tool data
  const randomAgentInstructions = `You are a specialized random number agent. Use the '_generate_actual_random_number' tool to get a random number. Then, return it in a string format like: 'Here\\'s a random number for you: [number]'`;
  const randomAgentCode = `@function_tool
def _generate_actual_random_number() -> int:
    """Generates a random integer between 1 and 100 (inclusive)."""
    return random.randint(1, 100)`;

  const fileReaderAgentInstructions = `You are a specialized file reader agent. Use the '_read_test_data_file_content' tool to read the contents of 'test_data.txt'. Return the content obtained from the tool, or the error message if the tool provides one.`;
  const fileReaderAgentCode = `@function_tool
def _read_test_data_file_content() -> str:
    """Reads the content of 'test_data.txt' from the current working directory and returns it."""
    file_path = "test_data.txt"
    try:
        with open(file_path, 'r') as f:
            content = f.read()
        return content
    except FileNotFoundError:
        return f"Error: The file '{file_path}' was not found."
    except Exception as e:
        return f"Error reading file '{file_path}': {e}"`;

  const exampleToolsData = [
    {
      name: "Random Number Specialist",
      description: randomAgentInstructions,
      code: randomAgentCode
    },
    {
      name: "File Reader Specialist",
      description: fileReaderAgentInstructions,
      code: fileReaderAgentCode
    }
  ];

  // Seed database with example tools if they don't exist
  exampleToolsData.forEach(toolData => {
    const existingTool = db.prepare('SELECT id FROM tools WHERE name = ?').get(toolData.name);
    if (!existingTool) {
      try {
        const stmt = db.prepare('INSERT INTO tools (name, description, code) VALUES (?, ?, ?)');
        stmt.run(toolData.name, toolData.description, toolData.code);
        console.log(`Example tool "${toolData.name}" added to the database.`);
      } catch (error) {
        console.error(`Failed to add example tool "${toolData.name}":`, error);
      }
    }
  }); 

  // Seed database with example tool group if it doesn't exist
  const existingGroup = db.prepare('SELECT id FROM tool_groups WHERE name = ?').get('Sample Helper Group');
  if (!existingGroup) {
    try {
      db.transaction(() => {
        // Create the tool group
        const groupStmt = db.prepare('INSERT INTO tool_groups (name, instructions) VALUES (?, ?)');
        const groupInfo = groupStmt.run(
          'Sample Helper Group',
          'You are a helpful assistant that can generate random numbers and read files. Use the available tools to help users with these tasks. Always be friendly and helpful in your responses.'
        );
        const groupId = groupInfo.lastInsertRowid;

        // Get the sample tools to add to the group
        const randomTool = db.prepare('SELECT id FROM tools WHERE name = ?').get('Random Number Specialist');
        const fileTool = db.prepare('SELECT id FROM tools WHERE name = ?').get('File Reader Specialist');

        if (randomTool && fileTool) {
          const toolAssocStmt = db.prepare('INSERT INTO tool_group_tools (tool_group_id, tool_id) VALUES (?, ?)');
          toolAssocStmt.run(groupId, randomTool.id);
          toolAssocStmt.run(groupId, fileTool.id);
          console.log(`Example tool group "Sample Helper Group" created with 2 tools.`);
        }
      })();
    } catch (error) {
      console.error('Failed to create example tool group:', error);
    }
  }

  console.log('Database seeding completed');
} 