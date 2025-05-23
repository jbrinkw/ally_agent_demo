import os
from dotenv import load_dotenv
from agents import Agent, Runner, function_tool
from send_email import send_email # From your existing send_email.py
import asyncio
import time # For adding a delay in the loop

# Load environment variables from .env file (for OPENAI_API_KEY)
# GMAIL_USERNAME and GMAIL_PASSWORD should also be set in your environment or .env file
load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GMAIL_USERNAME = os.getenv("GMAIL_USERNAME")
GMAIL_PASSWORD = os.getenv("GMAIL_PASSWORD")

# --- Tool and Agent Definitions (mirroring external_tool_agents.py for consistency) ---
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

email_sending_specialist_agent = Agent(
    name="Email Sending Specialist",
    instructions=(
        "You are a specialized email sending agent. "
        "The user will provide all necessary details: recipient's email address, subject line, and the body content directly in their request. "
        "Do not ask for confirmation for these details. Assume the user's initial prompt contains all required information. "
        "Attachments are not supported in this automated test. "
        "Use the '_send_email_tool' directly with the provided recipient, subject, and body to send the email. "
        "Relay the outcome (success or error message) from the tool back to the user. "
        "Before attempting to send, briefly remind the user that GMAIL_USERNAME and GMAIL_PASSWORD environment variables must be correctly set for the email to be sent."
    ),
    tools=[_send_email_tool],
    model="gpt-4.1-nano" # Or your preferred model
)
# --- End of Tool and Agent Definitions ---

def main_test_loop():
    print("--- Automated Email Agent Test Loop (Ctrl+C to stop) ---")
    if not OPENAI_API_KEY:
        print("Error: OPENAI_API_KEY is not set. Please set it in your .env file or environment.")
        return
    if not GMAIL_USERNAME or not GMAIL_PASSWORD:
        print("Warning: GMAIL_USERNAME and/or GMAIL_PASSWORD are not set. The agent will attempt to send, but it will likely fail and report the error from send_email.py.")
        print("Please set them in your .env file or environment for successful email sending.")

    # Hardcoded email details
    recipient = "jdb1024001@gmail.com"
    subject = "hello"
    body = "from the other side"

    user_query = f"Send an email to {recipient} with the subject '{subject}' and body '{body}'."
    print(f"\n--- Attempting to send email --- ")
    print(f"To: {recipient}")
    print(f"Subject: {subject}")
    print(f"Body: {body}")
    # print(f"Using query: {user_query}") # Optional: print the full query to the agent

    try:
        # Ensure an event loop for Runner.run_sync
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:  # No current event loop
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        result = Runner.run_sync(email_sending_specialist_agent, user_query)
        print("\n--- Agent's Final Output ---")
        print(result.final_output)
        print("---------------------------")

    except Exception as e:
        print(f"\nAn error occurred during agent execution: {e}")
        print("---------------------------")

if __name__ == "__main__":
    try:
        
            main_test_loop()
            print("Waiting for 10 seconds before next attempt...")
            time.sleep(10) # Wait for 10 seconds before the next attempt
    except KeyboardInterrupt:
        print("\nAutomated test loop stopped by user.") 