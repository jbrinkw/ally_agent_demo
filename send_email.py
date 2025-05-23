import smtplib
from email.message import EmailMessage
import os

# 1. Configure
SMTP_SERVER = 'smtp.gmail.com'
SMTP_PORT   = 587

def send_email(recipient_email, subject_line, body_content, attachment_file_path=None):
    """
    Sends an email using Gmail SMTP.

    Args:
        recipient_email (str): The email address of the recipient.
        subject_line (str): The subject of the email.
        body_content (str): The plain text content of the email body.
        attachment_file_path (str, optional): Path to a file to attach. Defaults to None.
    """
    gmail_username = os.environ.get('GMAIL_USERNAME')
    gmail_password = os.environ.get('GMAIL_PASSWORD')

    if not gmail_username or not gmail_password:
        # Return an error string instead of printing directly, so the agent can handle it
        error_message = ("Error: GMAIL_USERNAME and GMAIL_PASSWORD environment variables must be set. "
                         "Please set them in your environment. For example, in PowerShell: "
                         "$env:GMAIL_USERNAME = \"your_email@gmail.com\"; "
                         "$env:GMAIL_PASSWORD = \"your_app_password_or_regular_password\"")
        return error_message

    msg = EmailMessage()
    msg['Subject'] = subject_line
    msg['From']    = gmail_username
    msg['To']      = recipient_email
    msg.set_content(body_content)

    if attachment_file_path:
        file_name = os.path.basename(attachment_file_path)
        try:
            with open(attachment_file_path, 'rb') as f:
                file_data = f.read()
                msg.add_attachment(file_data,
                                   maintype='application',
                                   subtype='octet-stream', # Or determine dynamically if needed
                                   filename=file_name)
        except FileNotFoundError:
            return f"Error: Attachment file not found at {attachment_file_path}"
        except Exception as e:
            return f"Error attaching file: {e}"

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(gmail_username, gmail_password)
            smtp.send_message(msg)
        return 'Email sent successfully.'
    except smtplib.SMTPAuthenticationError:
        return ("SMTP Authentication Error: Username and Password not accepted. "
                "Check credentials and Google Account security settings (App Passwords / Less Secure Apps). "
                "Visit: https://support.google.com/mail/?p=BadCredentials")
    except Exception as e:
        return f"An error occurred while sending email: {e}"

# if __name__ == "__main__":
#     # Example usage:
#     # Make sure to set your GMAIL_USERNAME and GMAIL_PASSWORD environment variables first!

#     recipient = "jdb1024001@gmail.com" # Or any other recipient
#     subject = "Test Email from Python Script"
#     body = "This is the body of the test email. It's sent from a Python function!"

#     # To send without an attachment:
#     # result = send_email(recipient, subject, body)
#     # print(result)

#     # To send with an attachment (make sure 'test_data.txt' exists or change the path):
#     attachment = 'test_data.txt'
#     if os.path.exists(attachment):
#         result = send_email(recipient, subject, body, attachment_file_path=attachment)
#         print(result)
#     else:
#         print(f"Attachment file '{attachment}' not found for example usage. Sending email without attachment.")
#         result = send_email(recipient, subject, body)
#         print(result)

#     # Example sending to a different recipient without attachment
#     # result = send_email("another_recipient@example.com", "Hello there!", "Just a friendly email.")
#     # print(result)
