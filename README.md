# Ally Agent Demo

A sophisticated **AI Agent Tool Management System** that enables dynamic creation, organization, and deployment of AI tools. This system bridges web-based tool management with Python AI agents, featuring MCP (Model Context Protocol) server integration and automatic tool generation.

## 🚀 Quick Start

```bash
# Start the web management interface
npm start
# Access at: http://localhost:3000

# Start the AI chat interface
streamlit run agent.py
# Access at: http://localhost:8501
```

## 📋 Table of Contents

- [🏗️ Architecture Overview](#️-architecture-overview)
- [📁 Project Structure](#-project-structure)
- [🔧 Core Components](#-core-components)
- [🛠️ Tools vs Tool Groups](#️-tools-vs-tool-groups)
- [📋 Complete Workflow Guide](#-complete-workflow-guide)
- [🔌 MCP Server Integration](#-mcp-server-integration)
- [🧪 Example Scenarios](#-example-scenarios)
- [⚙️ Configuration](#️-configuration)
- [🚀 Deployment](#-deployment)

## 🏗️ Architecture Overview

This system follows a **clean, modular architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────────────────┐
│                 WEB INTERFACE                       │
│              (Express.js + EJS)                     │
├─────────────────────────────────────────────────────┤
│  Tool Management  │  Tool Groups  │  MCP Import     │
├─────────────────────────────────────────────────────┤
│                DATABASE LAYER                       │
│            (SQLite with Sessions)                   │
├─────────────────────────────────────────────────────┤
│              PYTHON GENERATION                      │
│            (Dynamic Tool Creation)                  │
├─────────────────────────────────────────────────────┤
│                AI CHAT INTERFACE                    │
│              (Streamlit + OpenAI)                   │
└─────────────────────────────────────────────────────┘
```

### Key Features

- **🧠 Dynamic Tool Generation**: Create Python AI tools via web interface
- **📦 Tool Grouping**: Organize tools into logical groups with shared instructions
- **🔌 MCP Integration**: Import tools from external MCP servers
- **🤖 AI-Powered Instructions**: Auto-generate tool group instructions using OpenAI
- **💬 Interactive Chat**: Streamlit-based chat interface with tool execution
- **🎛️ Session Management**: Enable/disable tools and groups dynamically
- **📊 Real-time Updates**: Changes reflect immediately in the AI agent

## 📁 Project Structure

```
ally_agent_demo/
├── app.js                          # 🎯 Main application (50 lines)
├── agent.py                        # 💬 Streamlit chat interface
├── external_tool_agents.py         # 🔄 Auto-generated tool file
├── internal_tool_agents.py         # 🏠 Built-in tools (CSV, Stock)
├── email_specialist_mcp.py         # 📧 Email MCP server
│
├── config/                         # ⚙️ Configuration
│   ├── database.js                 # 💾 SQLite setup & schema
│   └── middleware.js               # 🛠️ Express middleware
│
├── services/                       # 🔧 Business Logic
│   ├── openaiService.js            # 🤖 AI instruction generation
│   └── externalToolsGenerator.js   # 🏭 Python code generation
│
├── routes/                         # 🛣️ API Endpoints
│   ├── tools.js                    # 🔧 Individual tool CRUD
│   ├── toolGroups.js               # 📦 Tool group management
│   └── mcpServer.js                # 🔌 MCP server integration
│
├── views/                          # 🎨 Web Templates
│   ├── index.ejs                   # 📋 Tools list
│   ├── tool.ejs                    # 🔧 Tool details
│   ├── tool-groups.ejs             # 📦 Groups list
│   ├── tool-group-detail.ejs       # 📦 Group details
│   ├── tool-group-form.ejs         # ✏️ Group creation/editing
│   ├── form.ejs                    # ✏️ Tool creation/editing
│   └── import-mcp-server.ejs       # 🔌 MCP import interface
│
├── utils/                          # 🧰 Utilities
│   ├── seedData.js                 # 🌱 Database seeding
│   └── send_email.py               # 📧 Email functionality
│
├── public/css/                     # 🎨 Styling
├── db/                             # 💾 SQLite databases
└── package.json                    # 📦 Node.js dependencies
```

## 🔧 Core Components

### 1. **Main Application (`app.js`)**
- **Size**: 50 lines (was 1,319 lines!)
- **Purpose**: Clean orchestrator that imports modules and starts server
- **Features**: Dependency injection, route mounting, middleware configuration

### 2. **Database Layer (`config/database.js`)**
- **Database**: SQLite with better-sqlite3
- **Tables**: 
  - `tools` - Individual tools (name, description, code)
  - `tool_groups` - Tool groups (name, instructions)
  - `tool_group_tools` - Many-to-many relationships
- **Features**: Auto-schema creation, data seeding

### 3. **Services Layer**

#### OpenAI Service (`services/openaiService.js`)
- **Purpose**: Generate tool group instructions using GPT-4
- **Input**: Group name + tool descriptions
- **Output**: Contextualized usage instructions

#### External Tools Generator (`services/externalToolsGenerator.js`)
- **Purpose**: Generate `external_tool_agents.py` from enabled tools
- **Features**: 
  - Regular tool code generation
  - MCP tool wrapping with async handling
  - Agent creation with proper instructions

### 4. **Route Modules**

#### Tools Routes (`routes/tools.js`)
- Individual tool CRUD operations
- Tool enabling/disabling
- External tools file generation trigger

#### Tool Groups Routes (`routes/toolGroups.js`)
- Tool group CRUD operations
- Auto-instruction generation
- Group enabling/disabling

#### MCP Server Routes (`routes/mcpServer.js`)
- MCP server discovery via HTTP
- Tool import and database storage
- Python subprocess management

### 5. **AI Chat Interface (`agent.py`)**
- **Framework**: Streamlit
- **Features**: Real-time chat with tool execution
- **Tool Loading**: Dynamic import from both internal and external tools
- **Agent**: OpenAI Agents SDK with automatic tool selection

## 🛠️ Tools vs Tool Groups

### **Individual Tools**
- **Definition**: Single Python functions that perform specific tasks
- **Structure**: Function + Agent wrapper
- **Examples**: 
  - Random Number Generator
  - File Reader
  - Stock Price Fetcher
  - Email Sender (via MCP)

**Example Tool Structure:**
```python
@function_tool
def get_stock_price(ticker: str, date: str) -> str:
    """Fetches stock closing price for given ticker and date."""
    # Tool implementation here
    return result

stock_agent = Agent(
    name="Stock Info Specialist",
    instructions="You are a stock specialist...",
    tools=[get_stock_price]
)
```

### **Tool Groups**
- **Definition**: Collections of related tools with shared instructions
- **Purpose**: Create specialized AI agents with multiple capabilities
- **Benefits**: 
  - Coherent behavior across related tools
  - Context-aware instructions
  - Easier management of complex workflows

**Example Tool Group:**
```python
# Email Tool Group (3 tools)
email_specialist_agent = Agent(
    name="Email Specialist",
    instructions="You can read emails, get summaries, and send emails...",
    tools=[get_email_body, get_recent_emails_summary, send_email_tool]
)
```

### **Key Differences**

| Aspect | Individual Tools | Tool Groups |
|--------|------------------|-------------|
| **Scope** | Single function | Multiple related functions |
| **Instructions** | Tool-specific | Context-aware for group |
| **Use Case** | Simple tasks | Complex workflows |
| **Management** | Individual enable/disable | Group enable/disable |
| **AI Behavior** | Focused | Collaborative |

## 📋 Complete Workflow Guide

### Workflow 1: Creating Individual Tools

1. **Navigate to Tools**
   - Go to `http://localhost:3000`
   - Click "Add New Tool"

2. **Define the Tool**
   ```
   Name: Weather Checker
   Description: Gets weather for a given city
   Code:
   @function_tool
   def get_weather(city: str) -> str:
       """Gets weather information for the specified city."""
       # Your implementation here
       return f"Weather in {city}: Sunny, 25°C"
   ```

3. **Save and Enable**
   - Click "Create Tool"
   - Toggle the tool "ON" in the tools list
   - Click "Update External Tools"

4. **Use in Chat**
   - Run `streamlit run agent.py`
   - Ask: "What's the weather in Paris?"
   - The agent will automatically use your tool

### Workflow 2: Creating Tool Groups

1. **Create Individual Tools First**
   - Create multiple related tools (e.g., email tools)

2. **Create Tool Group**
   - Go to `http://localhost:3000/tool-groups`
   - Click "Create New Tool Group"
   - Enter group name: "Email Management"

3. **Select Tools and Generate Instructions**
   - Check the tools you want to include
   - Click "🤖 Auto-Generate Instructions"
   - Review and edit the generated instructions

4. **Save and Enable**
   - Click "Create Tool Group"
   - Toggle the group "ON"
   - Click "Update External Tools"

### Workflow 3: Importing MCP Server Tools

1. **Prepare MCP Server**
   - Ensure your MCP server is running (e.g., `http://localhost:8000/mcp`)
   - Example: `python email_specialist_mcp.py`

2. **Import via Web Interface**
   - Go to `http://localhost:3000/import-mcp-server`
   - Enter server URL: `http://localhost:8000/mcp`
   - Click "Connect & Discover Tools"

3. **Create Tool Group**
   - Review discovered tools
   - Enter group name: "MCP Email Tools"
   - Click "🤖 Auto-Generate Instructions"
   - Click "Import and Create Group"

4. **Enable and Use**
   - Go to Tool Groups, enable the new group
   - Click "Update External Tools"
   - Tools are now available in the chat interface

### Workflow 4: Complete End-to-End Example

Let's walk through creating a comprehensive "Customer Support" workflow:

#### Step 1: Start MCP Email Server
```bash
python email_specialist_mcp.py
# Server runs on http://localhost:8000/mcp
```

#### Step 2: Import Email Tools
- Go to `http://localhost:3000/import-mcp-server`
- URL: `http://localhost:8000/mcp`
- Import creates: `get_email_body`, `get_recent_emails_summary`, `send_email_tool`

#### Step 3: Create Custom Tools
Create a "Customer Database" tool:
```python
@function_tool
def get_customer_info(customer_id: str) -> str:
    """Retrieves customer information from database."""
    # Mock implementation
    return f"Customer {customer_id}: John Doe, Premium Plan, Last contact: 2024-01-15"
```

#### Step 4: Create "Customer Support" Tool Group
- Include: Email tools + Customer database tool
- Auto-generated instructions:
  ```
  You are a customer support specialist. Use email tools to read 
  customer inquiries and send responses. Use the customer database 
  to lookup account information. Always be helpful and professional.
  ```

#### Step 5: Enable Everything
- Enable the "Customer Support" tool group
- Click "Update External Tools"

#### Step 6: Test in Chat
```
User: "I received an email about a billing issue. Can you help?"

Agent: 
1. Uses get_recent_emails_summary to find emails
2. Uses get_email_body to read the specific email
3. Uses get_customer_info to lookup account details
4. Drafts a response using send_email_tool
```

## 🔌 MCP Server Integration

### Supported MCP Servers

This system supports **HTTP-based MCP servers** using the FastMCP client:

```python
# Example MCP Server
from fastmcp import FastMCP

mcp = FastMCP("Email Server")

@mcp.tool()
def send_email(recipient: str, subject: str, body: str) -> str:
    """Send an email to the specified recipient."""
    # Implementation here
    return "Email sent successfully"
```

### MCP Tool Discovery Process

1. **Connection**: FastMCP Client connects to MCP server URL
2. **Discovery**: Calls `list_tools()` to get available tools
3. **Analysis**: Extracts tool names, descriptions, and parameters
4. **Code Generation**: Creates Python wrapper functions with async handling
5. **Integration**: Wraps tools in Agent instances for use

### Generated MCP Tool Structure

When you import an MCP tool, the system generates:

```python
@function_tool
def mcp_tool_name(param1: str, param2: str = None) -> str:
    """Original tool description from MCP server."""
    try:
        from fastmcp import Client
        import asyncio
        
        async def _mcp_tool_name():
            client = Client("http://mcp-server-url")
            async with client:
                result = await client.call_tool("original_name", {
                    "param1": param1,
                    "param2": param2 if param2 else None
                })
                return str(result)
        
        # Handle event loop scenarios (Streamlit compatibility)
        try:
            loop = asyncio.get_running_loop()
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _mcp_tool_name())
                return future.result()
        except RuntimeError:
            return asyncio.run(_mcp_tool_name())
    except Exception as e:
        return f"Error calling MCP tool: {str(e)}"
```

## 🧪 Example Scenarios

### Scenario 1: Data Analysis Workflow
```python
# Tools Created:
# 1. CSV Reader Tool
# 2. Data Analyzer Tool
# 3. Chart Generator Tool
# 4. Report Emailer Tool (via MCP)

# Tool Group: "Data Analysis Suite"
# Instructions: "Analyze CSV data, create visualizations, and email reports"

# User: "Analyze sales_data.csv and email the report to manager@company.com"
# Agent: Automatically uses all 4 tools in sequence
```

### Scenario 2: Social Media Management
```python
# MCP Server: Social Media API
# Tools: post_tweet, get_mentions, schedule_post

# Custom Tools: content_generator, hashtag_optimizer

# Tool Group: "Social Media Manager"
# User: "Check mentions and respond to any customer complaints"
```

### Scenario 3: DevOps Automation
```python
# MCP Server: Infrastructure Management
# Tools: deploy_app, check_logs, restart_service

# Custom Tools: code_quality_check, notification_sender

# Tool Group: "DevOps Assistant"
# User: "Deploy the latest version and notify the team"
```

## ⚙️ Configuration

### Environment Variables (.env)
```bash
# OpenAI API Key (required for instruction generation)
OPENAI_API_KEY=your_openai_api_key_here

# Email Configuration (for email tools)
GMAIL_USERNAME=your_email@gmail.com
GMAIL_PASSWORD=your_app_password
```

### Database Configuration
- **Engine**: SQLite with better-sqlite3
- **Location**: `./db/tools.db`
- **Sessions**: `./db/sessions.sqlite`
- **Auto-creation**: Schema created automatically on startup

### Port Configuration
- **Web Interface**: Port 3000 (configurable in `app.js`)
- **Chat Interface**: Port 8501 (Streamlit default)
- **MCP Servers**: Configurable (typically 8000+)

## 🚀 Deployment

### Development Setup
```bash
# Clone and install
git clone [repository]
cd ally_agent_demo
npm install

# Setup Python environment
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Start development
npm start              # Web interface
streamlit run agent.py # Chat interface
```

### Production Deployment

#### Web Interface (PM2)
```bash
npm install -g pm2
pm2 start app.js --name ally-agent-web
pm2 startup
pm2 save
```

#### Chat Interface (Docker)
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8501
CMD ["streamlit", "run", "agent.py", "--server.port=8501", "--server.address=0.0.0.0"]
```

### Environment-Specific Configurations

#### Development
- SQLite databases in `./db/`
- Local file storage
- Debug logging enabled

#### Production
- External database (PostgreSQL recommended)
- Object storage for files
- Error tracking (Sentry)
- Load balancing
- HTTPS termination

## 📊 System Benefits

### For Developers
- **🔧 Rapid Prototyping**: Create AI tools without complex setup
- **📦 Modular Architecture**: Clean, maintainable codebase
- **🔌 Integration Ready**: Easy MCP server integration
- **🧪 Testing Friendly**: Each module can be tested independently

### For Users
- **💬 Natural Interface**: Chat with AI to use tools
- **🎛️ Dynamic Control**: Enable/disable tools in real-time
- **📋 Organization**: Group related tools logically
- **🤖 Intelligence**: AI automatically selects appropriate tools

### For Teams
- **👥 Collaboration**: Multiple people can create tools
- **📚 Knowledge Sharing**: Tool groups capture workflows
- **🔄 Reusability**: Tools can be reused across projects
- **📈 Scalability**: Add new capabilities without code changes

---

## 🎯 Next Steps

1. **Explore the Interface**: Start with `npm start` and create your first tool
2. **Try MCP Integration**: Set up the email MCP server and import tools
3. **Create Tool Groups**: Combine related tools for complex workflows
4. **Chat with Your Agent**: Use `streamlit run agent.py` to interact with your tools
5. **Extend the System**: Add new MCP servers or custom tools

The Ally Agent Demo showcases the power of modular AI tool management - turning complex AI workflows into simple, manageable components that anyone can create and use! 🚀