# Tool Manager Web App - Beginner's Guide

## 1. Project Overview

This project is a simple web application called "Tool Manager." It allows you to:

*   **Create** new "tool" records.
*   **View** a list of all tools.
*   **See detailed information** for each tool.
*   **Edit** existing tools.
*   **Delete** tools.

Each "tool" is just a collection of text fields: Name, Description, Input Format, Output Format, and associated Code.

This guide will walk you through the different parts of the project to help you understand how it works, even if you're new to web development with Node.js.

## 2. Technologies Used

*   **Node.js:** This is a JavaScript runtime environment. It allows you to run JavaScript code on your computer (server-side) instead of just in a web browser (client-side).
*   **Express.js (Express):** A popular and minimalist web application framework for Node.js. It helps simplify the process of building web servers and handling web requests (like when you type a URL into your browser).
*   **EJS (Embedded JavaScript templating):** A simple templating language that lets you generate HTML markup with plain JavaScript. It's used to create the web pages dynamically by inserting data into HTML templates.
*   **better-sqlite3:** A Node.js library for interacting with the main application's SQLite database (`tools.db`).
*   **connect-sqlite3:** A Node.js library used with Express Session to store session data in an SQLite database (`sessions.sqlite`).
*   **SQLite:** The actual database system that stores your tool data in a file named `db/tools.db` and session data in `db/sessions.sqlite`.
*   **HTML (HyperText Markup Language):** The standard language for creating web pages.
*   **CSS (Cascading Style Sheets):** Used to describe the presentation (styling, layout, look and feel) of web pages.

## 3. File Structure

Here's a look at the main files and directories and what they do:

```
/toolUI
|-- app.js                 # The main server-side application logic (Node.js + Express).
|-- /db/                   # Directory for database files.
|   |-- tools.db           # The SQLite database file where your tool data is stored.
|   |-- sessions.sqlite    # The SQLite database file for storing user session data.
|-- package.json           # Lists project information, dependencies, and scripts.
|-- package-lock.json      # Records the exact versions of installed dependencies.
|-- /node_modules/         # Directory where project dependencies (libraries) are installed (created by npm).
|-- /public/
|   |-- /css/
|       |-- style.css      # Stylesheet for the application's appearance.
|-- /views/
|   |-- index.ejs          # EJS template for the page listing all tools.
|   |-- tool.ejs           # EJS template for the page showing details of a single tool.
|   |-- form.ejs           # EJS template for the form to add or edit a tool.
|   |-- cart.ejs           # EJS template for the shopping cart page.
|-- README.md              # This guide file.
|-- .gitignore             # Specifies intentionally untracked files that Git should ignore.
```

*   **`app.js`**: The heart of the application. It sets up the web server, defines how to handle different URLs (routes), interacts with the database, and decides which HTML page to send back to the user.
*   **`db/`**: This directory now holds all SQLite database files.
    *   **`db/tools.db`**: Stores all the information about the tools.
    *   **`db/sessions.sqlite`**: Used by `connect-sqlite3` to store user session information (like the contents of their shopping cart).
*   **`package.json`**: Contains metadata about the project, like its name, version, and importantly, the libraries (dependencies) it needs to run (e.g., Express, EJS, better-sqlite3, connect-sqlite3, express-session, papaparse). It also defines shortcut commands (scripts) like `npm start`.
*   **`package-lock.json`**: Automatically generated/updated by `npm` (Node Package Manager). It ensures that everyone working on the project uses the exact same versions of the dependencies, which helps avoid a "it works on my machine" problem.
*   **`node_modules/`**: This directory is created when you run `npm install`. It contains all the actual code for the libraries (dependencies) listed in `package.json`.
*   **`public/`**: This directory holds static files that are sent directly to the user's browser without any server-side processing. This usually includes CSS files, client-side JavaScript files, and images.
    *   `public/css/style.css`: Contains all the CSS rules that define how the HTML pages look (colors, fonts, layout, etc.).
*   **`views/`**: This directory contains the EJS template files. These are like HTML skeletons with special placeholders where dynamic data (like tool names or descriptions) can be inserted by `app.js` before being sent to the browser.
    *   `index.ejs`: Template for the home page, showing a list of all tools.
    *   `tool.ejs`: Template for the page that displays all details of a specific tool.
    *   `form.ejs`: Template for the HTML form used to create a new tool or edit an existing one.
    *   `cart.ejs`: Template for the shopping cart page, showing selected items and an export option.
*   **`README.md`**: The file you are currently reading!
*   **`.gitignore`**: Tells Git which files or folders to ignore (e.g., `node_modules/`, `db/*.sqlite`).

## 4. How it Works (Simplified Flow)

Imagine you want to see the list of all tools:

1.  **You (User) Open a Page:** You type `http://localhost:3000/` into your web browser and hit Enter.
2.  **Browser Sends a Request:** Your browser sends an HTTP GET request to the server running at `localhost` on port `3000`, asking for the resource at the path `/` (the home page).
3.  **Node.js/Express Server Receives Request:** The `app.js` script (which is your server) is listening for requests. It receives this GET request for `/`.
4.  **`app.js` Matches the URL to a Route:** Inside `app.js`, there's a section that says, "If I get a GET request for `/`, do this...". This is called a "route handler".
5.  **Route Handler Function Runs:** The code for this specific route handler starts running.
6.  **Database Interaction (Optional):** In this case, the handler for `/` needs to show all tools. So, it talks to the SQLite database (`tools.db`) and fetches all the tool records.
7.  **Prepare HTML with EJS Template:** The route handler then takes the list of tools it got from the database and uses the `index.ejs` template from the `views/` directory. It inserts the tool names and description previews into the placeholders in the template.
8.  **Server Sends HTML Back:** The server sends the fully formed HTML page (generated from the EJS template and data) back to your browser.
9.  **Browser Displays Page:** Your browser receives the HTML and displays it. It also requests any linked CSS files (like `style.css` from the `public/` directory) to make the page look nice.

This basic flow (request -> server processing -> response) is fundamental to how most web applications work.

## 5. Understanding `app.js` (Key Sections)

Let's break down `app.js`:

*   **Imports (Lines 1-5):**
    ```javascript
    import express from 'express';
    import Database from 'better-sqlite3';
    import session from 'express-session';
    import connectSqlite3 from 'connect-sqlite3';
    import Papa from 'papaparse';
    import fs from 'fs';
    import path from 'path';
    ```
    This loads the external libraries (Express, better-sqlite3, express-session, connect-sqlite3, papaparse) and built-in Node.js modules (fs, path) that the application needs to function.

*   **Express Setup (Lines 12-13):**
    ```javascript
    const app = express();
    const port = 3000;
    ```
    This creates an Express application instance (named `app`) and defines the port (`3000`) on which the server will listen.

*   **Ensure 'db' Directory Exists & Database Paths:**
    ```javascript
    const dbDir = path.join(__dirname, 'db');
    if (!fs.existsSync(dbDir)) { fs.mkdirSync(dbDir, { recursive: true }); }
    const db = new Database(path.join(dbDir, 'tools.db'));
    ```
    The code now ensures a `db` directory exists. The main application database `tools.db` will reside there. The session database (`sessions.sqlite`) is also configured to be stored in this `db` directory by `connect-sqlite3`.

*   **Session Setup:**
    ```javascript
    const SQLiteStore = connectSqlite3(session);
    app.use(session({
      store: new SQLiteStore({
        db: 'sessions.sqlite', // Filename for the session database
        dir: './db',          // Directory to store the session database file
        table: 'sessions'     // Name of the table to store sessions
      }),
      secret: 'your new secret key for sqlite sessions', // IMPORTANT: Change this to a strong, random secret
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 1000 * 60 * 60 * 24 } // Cookie valid for 24 hours
    }));
    ```
    This section configures `express-session` to use `connect-sqlite3` as its store. Session data (like the shopping cart) will be saved in the `db/sessions.sqlite` file.

*   **Database Setup (for `tools.db`):**
    ```javascript
    const db = new Database(path.join(dbDir, 'tools.db'));
    db.exec(`CREATE TABLE IF NOT EXISTS tools (...)`);
    ```
    This connects to the main application database `tools.db` (now located in the `db` directory) and ensures the `tools` table is created.

*   **Middleware (Lines 34-45):**
    Middleware are functions that process incoming requests before they reach the route handlers. They can modify the request/response objects or perform other tasks.
    *   `app.use(express.urlencoded({ extended: false }));`
        This middleware is crucial for handling data sent from HTML forms (like when you add or edit a tool). It parses the form data and makes it available in `req.body` within your route handlers.
    *   `app.use(express.static(path.join(__dirname, 'public')));`
        This middleware tells Express to serve static files (like CSS, images, or client-side JavaScript) directly from the `public` directory. So, if the browser requests `/css/style.css`, Express will find and send `public/css/style.css`.

*   **View Engine (EJS) Setup (Lines 48-50):**
    ```javascript
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));
    ```
    This configures EJS as the templating engine. `app.set('view engine', 'ejs')` tells Express to use EJS. `app.set('views', ...)` tells Express that the EJS template files are located in the `views` directory.

*   **Routes (Lines 54 onwards):**
    Routes define how the application responds to specific URLs and HTTP methods (GET, POST, etc.).
    *   **Example GET Route (`/` - List all tools):**
        ```javascript
        app.get('/', (req, res) => {
          // 1. Fetch tools from the database
          const stmt = db.prepare('SELECT id, name, description FROM tools ORDER BY name ASC');
          const tools = stmt.all();
          // 2. Prepare preview data
          const toolsWithPreview = tools.map(tool => ({ /* ... */ }));
          // 3. Render the 'index.ejs' template with the data
          res.render('index', { tools: toolsWithPreview, title: 'All Tools' });
        });
        ```
        When a user goes to the home page (`/`), this code runs. It gets tools from the database, creates a short preview for each description, and then uses `res.render()` to combine the `index.ejs` template with this data to generate the final HTML page.

    *   **Example POST Route (`/new` - Create a new tool):**
        ```javascript
        app.post('/new', (req, res) => {
          // 1. Get data submitted from the form (via req.body)
          const { name, description, ... } = req.body;
          // 2. Validate the data (e.g., make sure name and description aren't empty)
          if (!name || !description) { /* ... send error ... */ }
          // 3. Insert the new tool into the database
          const stmt = db.prepare('INSERT INTO tools (...) VALUES (...)');
          stmt.run(name, description, ...);
          // 4. Redirect the user to the home page
          res.redirect('/');
        });
        ```
        When the "Add New Tool" form is submitted, it sends a POST request to `/new`. This code receives the submitted data (thanks to the `express.urlencoded` middleware), validates it, saves it to the database, and then redirects the user back to the home page to see the newly added tool.

*   **Server Start (Lines 222-225):**
    ```javascript
    app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });
    ```
    This line actually starts the web server and makes it listen for incoming HTTP requests on the specified `port` (3000). The message is logged to your terminal to let you know the server is up and running.

## 6. Understanding EJS Templates (`views/`)

EJS files in the `views/` directory are mostly HTML, but with special tags that allow you to embed JavaScript and display dynamic data.

*   **`<%= ... %>` (Output Escaped Data):** Used to output a value from your JavaScript code into the HTML. It escapes HTML special characters, which is good for preventing Cross-Site Scripting (XSS) attacks when displaying user-provided text.
    *   Example: `<h1><%= title %></h1>` will take the value of the `title` variable (passed from `app.js` via `res.render()`) and insert it into the `<h1>` tag.

*   **`<%- ... %>` (Output Unescaped Data):** Similar to `<%= %>`, but it does *not* escape HTML special characters. Use this with caution, only when you are sure the data is safe or you explicitly want to render HTML content.
    *   Example: `<pre><code><%- tool.formattedCode %></code></pre>` is used for the code block because `tool.formattedCode` might contain newlines (`\n`) that should be rendered as actual line breaks within the `<pre>` tag, not as escaped text.

*   **`<% ... %>` (Logic Tag - No Output):** Used for JavaScript control flow statements like loops (`for`, `forEach`), conditionals (`if`/`else`), etc. This code is executed, but it doesn't directly output anything to the HTML unless you use `<%= %>` or `<%- %>` inside it.
    *   Example:
        ```html
        <% if (tools && tools.length > 0) { %>
            <% tools.forEach(tool => { %>
                <li class="tool-item">
                    <h2><a href="/tool/<%= tool.id %>"><%= tool.name %></a></h2>
                    <p class="description-preview"><%= tool.preview %></p>
                </li>
            <% }); %>
        <% } else { %>
            <p>No tools found.</p>
        <% } %>
        ```
        This code checks if there are any tools. If so, it loops through them and creates an `<li>` element for each one, displaying its name and preview. If not, it shows a "No tools found" message.

**How Data Gets to Templates:**
When `app.js` calls `res.render('templateName', { key1: value1, key2: value2 })`, the object `{ key1: value1, ... }` is passed to the EJS template. Inside the template, you can then access `value1` using the variable name `key1` (e.g., `<%= key1 %>`).

## 7. Static Files (`public/`)

The `public/` directory is for files that don't need any server-side processing and can be sent directly to the browser. This is configured in `app.js` with:

```javascript
app.use(express.static(path.join(__dirname, 'public')));
```

When an HTML page (like `index.ejs` after it's rendered) includes a link like `<link rel="stylesheet" href="/css/style.css">`, the browser will make a separate request to the server for `/css/style.css`.

Because of the `express.static` middleware, Express will look inside the `public` directory for a file at `css/style.css` (so, `public/css/style.css`) and send it directly to the browser.

## 8. Database (`db/tools.db` and `db/sessions.sqlite`)

*   **What they are:** The project now uses two SQLite database files, both located in the `db/` directory.
    *   **`db/tools.db`**: Stores the actual tool data (name, description, etc.) as before.
    *   **`db/sessions.sqlite`**: Stores session data for users, managed by `express-session` and `connect-sqlite3`. This is how the server remembers things like what's in a user's cart between different page loads.
*   **`tools` Table Schema:** (Remains the same in `tools.db`)
    *   `id INTEGER PRIMARY KEY AUTOINCREMENT`: A unique number for each tool (automatically generated).
    *   `name TEXT NOT NULL`: The tool's name (text, cannot be empty).
    *   `description TEXT NOT NULL`: The tool's description (text, cannot be empty).
    *   `input_desc TEXT`: Optional text for input format.
    *   `output_desc TEXT`: Optional text for output format.
    *   `code TEXT`: Optional text for the tool's code.

## 9. Running the Application

1.  **Prerequisites:**
    *   **Node.js and npm:** You need to have Node.js installed on your computer. npm (Node Package Manager) comes bundled with Node.js. You can download Node.js from [nodejs.org](https://nodejs.org/).

2.  **Install Dependencies (`npm install`):**
    *   Open your terminal or command prompt.
    *   Navigate to the project directory (`toolUI`).
    *   Run the command: `npm install`
    *   **What it does:** This command reads the `package.json` file, looks at the `dependencies` section (and `devDependencies`), and downloads all the listed libraries (like Express, EJS, better-sqlite3, connect-sqlite3, express-session, papaparse) from the internet, placing them into a `node_modules` directory within your project. This only needs to be done once, or whenever you change dependencies in `package.json`.

3.  **Start the Application (`npm start`):**
    *   In the same terminal, while still in the `toolUI` directory, run: `npm start`
    *   **What it does:** This command looks in `package.json` for a script named `start` (which we defined as `"node app.js"`). It then executes `node app.js`, which runs your main application file using Node.js.
    *   You should see a message in your terminal like: `Server running at http://localhost:3000`

4.  **Access in Browser:**
    *   Open your web browser (Chrome, Firefox, etc.).
    *   Go to the address: `http://localhost:3000/`
    *   You should see the Tool Manager web application!

This guide provides a starting point. The best way to learn is to experiment: try changing some text in the EJS files, modify a route in `app.js` (e.g., change a title), or add a new CSS rule in `style.css` and see what happens! Remember to restart the server (stop it by pressing `Ctrl+C` in the terminal, then run `npm start` again) after making changes to `app.js` for them to take effect. For changes in `.ejs` or `.css` files, often a browser refresh is enough if you are using `nodemon` (via `npm run dev`). 