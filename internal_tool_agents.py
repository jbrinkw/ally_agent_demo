from agents import Agent, function_tool
import os
import csv
from send_email import send_email # Assuming send_email.py is in the same directory or accessible
import yfinance as yf
from datetime import datetime, timedelta

# --- Constants ---
EMAIL_INBOX_FILE = "email_inbox.csv"

# --- Email Specialist ---
@function_tool
def _send_email_tool(recipient_email: str, subject_line: str, body_content: str, attachment_file_path: str = None) -> str:
    """ 
    Sends an email with the provided details. 
    Requires recipient_email, subject_line, and body_content. 
    attachment_file_path is optional. 
    Returns a status message indicating success or failure.
    Ensure GMAIL_USERNAME and GMAIL_PASSWORD environment variables are set for this tool to function.
    """
    return send_email(recipient_email, subject_line, body_content, attachment_file_path)

@function_tool
def _get_recent_emails_summary() -> list[dict[str, str]] | str:
    """
    Reads the simulated email inbox (email_inbox.csv) and returns a list of summaries 
    (sender and subject) for all emails. Returns an error string if the inbox file is not found.
    """
    summaries = []
    try:
        with open(EMAIL_INBOX_FILE, 'r', newline='') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                summaries.append({"sender": row['sender'], "subject": row['subject']})
        if not summaries:
            return "The simulated inbox is empty."
        return summaries
    except FileNotFoundError:
        return f"Error: The simulated email inbox file '{EMAIL_INBOX_FILE}' was not found."
    except Exception as e:
        return f"Error reading simulated inbox: {e}"

@function_tool
def _get_email_body(subject: str) -> str:
    """
    Reads the simulated email inbox (email_inbox.csv) and returns the body of the first email 
    that matches the given subject (case-insensitive). 
    Returns a 'not found' message if no match.
    """
    try:
        with open(EMAIL_INBOX_FILE, 'r', newline='') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                if row['subject'].lower() == subject.lower():
                    return row['body']
        return f"Email not found with subject '{subject}'."
    except FileNotFoundError:
        return f"Error: The simulated email inbox file '{EMAIL_INBOX_FILE}' was not found."
    except Exception as e:
        return f"Error reading simulated inbox: {e}"

email_specialist_agent = Agent(
    name="Email Specialist",
    instructions=(
        "You are a specialized email assistant. You have several capabilities: "
        "1. Sending emails: If the user wants to send an email, gather all necessary details (recipient, subject, body, optional attachment path), then use the '_send_email_tool'. Remind the user about GMAIL environment variables for sending. "
        "2. Reading recent email summaries: If the user asks to check their emails or see recent emails, use the '_get_recent_emails_summary' tool to list senders and subjects from their simulated inbox. You can use the output of this tool to help identify specific emails later. "
        "3. Reading a specific email's body: To use the '_get_email_body' tool, you need the exact subject line. "
        "   If the user provides the subject, you can directly use the '_get_email_body' tool. "
        "   If the subject is not clear, you can use the email summaries from '_get_recent_emails_summary' to help the user identify the correct subject, then ask them to confirm the subject they want to read before calling '_get_email_body'. "
        "Always relay the outcome (success, data, or error message) from any tool call back to the user. "
        "If sending an email, prepend your response with EMAIL SENT or EMAIL NOT SENT based on the tool outcome. "
        "Respond in plain text only. Do not use any Markdown formatting."
    ),
    tools=[_send_email_tool, _get_recent_emails_summary, _get_email_body]
)

# --- CSV Creator Specialist ---
@function_tool
def _create_csv_file(file_name: str, data: list[list[str]]) -> str:
    """
    Creates a CSV file with the given file_name and writes the provided data to it.
    The data should be a list of lists, where each inner list represents a row, and each item in the inner list is a cell.
    Example: [["Header1", "Header2"], ["Row1Cell1", "Row1Cell2"], ["Row2Cell1", "Row2Cell2"]]
    The file_name should include the .csv extension (e.g., 'output.csv').
    Returns the file path (e.g., 'output.csv' if saved in CWD) upon success or an error message string starting with 'Error:'.
    """
    if not file_name.lower().endswith('.csv'):
        file_name += ".csv"
    try:
        if not isinstance(data, list) or not all(isinstance(row, list) for row in data):
            return "Error: Invalid data format. Data must be a list of lists."
        if not data:
             return "Error: No data provided to write to CSV."
        with open(file_name, 'w', newline='') as csvfile:
            writer = csv.writer(csvfile)
            writer.writerows(data)
        return file_name
    except Exception as e:
        return f"Error creating CSV file '{file_name}': {e}"

csv_creator_specialist_agent = Agent(
    name="CSV Creator Specialist",
    instructions=(
        "You are a specialized CSV creation agent. "
        "The user will provide data to be saved in a CSV file, and optionally a desired file name. "
        "If no file name is provided by the user, use a default name like 'output.csv' or ask the user for a name. "
        "The data should ideally be structured as a table (list of lists). Clarify with the user if the data format is unclear. "
        "Use the '_create_csv_file' tool to create and save the CSV file. This tool returns the file path upon success or an error message. "
        "If successful, respond with a confirmation and the exact file path returned by the tool, like: 'Successfully created CSV file at: [file_path]'. "
        "If an error occurs, relay the error message from the tool. "
        "Respond in plain text only. Do not use any Markdown formatting."
    ),
    tools=[_create_csv_file]
)

# --- Stock Info Specialist ---
@function_tool
def _get_stock_closing_price(ticker: str, date_str: str) -> str:
    """
    Fetches the closing stock price for a given ticker symbol on a specific date using Yahoo Finance.
    Args:
        ticker (str): The stock ticker symbol (e.g., 'AAPL', 'MSFT').
        date_str (str): The date for which to fetch the closing price. 
                        Accepts formats like 'YYYY-MM-DD', 'M/D/YY', 'MM/DD/YYYY'.
    Returns:
        str: A message with the closing price or an error/not found message.
    """
    try:
        parsed_date = None
        for fmt in ('%Y-%m-%d', '%m/%d/%y', '%m/%d/%Y', '%Y/%m/%d'):
            try:
                parsed_date = datetime.strptime(date_str, fmt)
                break
            except ValueError:
                continue
        if not parsed_date:
            return f"Error: Could not parse date '{date_str}'. Please use a recognizable format like YYYY-MM-DD, M/D/YY, or MM/DD/YYYY."
        query_date_str = parsed_date.strftime('%Y-%m-%d')
        start_date_obj = parsed_date - timedelta(days=3)
        end_date_obj = parsed_date + timedelta(days=1)
        stock = yf.Ticker(ticker)
        hist = stock.history(start=start_date_obj.strftime('%Y-%m-%d'), end=end_date_obj.strftime('%Y-%m-%d'))
        if hist.empty:
            return f"No historical data found for ticker '{ticker}' around the date '{query_date_str}'. It might be an invalid ticker or delisted."
        target_day_data = hist[hist.index.strftime('%Y-%m-%d') == query_date_str]
        if target_day_data.empty:
            return f"No trading data found for '{ticker}' on '{query_date_str}'. It might have been a non-trading day (weekend/holiday)."
        closing_price = target_day_data['Close'].iloc[0]
        return f"The closing price for {ticker} on {query_date_str} was ${closing_price:.2f}."
    except Exception as e:
        return f"Error fetching stock data for '{ticker}' on '{date_str}': {e}"

stock_info_specialist_agent = Agent(
    name="Stock Info Specialist",
    instructions=(
        "You are a specialized stock information agent. "
        "When the user asks for a stock price, identify the ticker symbol and the date from their request. "
        "The date might be in various formats (e.g., YYYY-MM-DD, M/D/YY, MM/DD/YYYY). "
        "Use the '_get_stock_closing_price' tool to fetch the closing price. "
        "Relay the information (price or any error/not found message) from the tool back to the user. "
        "Respond in plain text only. Do not use any Markdown formatting."
    ),
    tools=[_get_stock_closing_price]
)

# List of directly usable tool objects to be imported by the main agent file
internal_tools_list = [
    email_specialist_agent.as_tool(
        tool_name="email_specialist_tool",
        tool_description="Call this tool for any email-related tasks, including sending new emails, checking summaries of received emails (sender and subject), or reading the body of a specific received email (identified by subject) from a simulated inbox."
    ),
    csv_creator_specialist_agent.as_tool(
        tool_name="create_csv_file_via_specialist_agent",
        tool_description="Call this tool to create a CSV file from provided data. You will need to provide the data and optionally a filename."
    ),
    stock_info_specialist_agent.as_tool(
        tool_name="get_stock_price_via_specialist_agent",
        tool_description="Call this tool to get the closing stock price for a given ticker symbol and date."
    )
] 