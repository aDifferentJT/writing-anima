"""MBOX email archive parser"""

from email.utils import parsedate_to_datetime
import logging
import mailbox
from pathlib import Path
from typing import Optional, cast

logger = logging.getLogger(__name__)


class MboxParser:
    """Parse MBOX email archives"""

    def __init__(self) -> None:
        """Initialize MBOX parser"""
        pass

    def extract_text_from_email(self, message: mailbox.mboxMessage) -> str:
        """
        Extract text content from an email message.

        Args:
            message: Email message object

        Returns:
            Extracted text content
        """
        text_parts = []

        # Get subject
        subject = message.get("Subject", "")
        if subject:
            text_parts.append(f"Subject: {subject}")

        # Get from/to
        from_addr = message.get("From", "")
        to_addr = message.get("To", "")
        if from_addr:
            text_parts.append(f"From: {from_addr}")
        if to_addr:
            text_parts.append(f"To: {to_addr}")

        # Add separator
        if text_parts:
            text_parts.append("")  # blank line

        # Extract body
        if message.is_multipart():
            # Handle multipart messages
            for part in message.walk():
                content_type = part.get_content_type()
                content_disposition = str(part.get("Content-Disposition", ""))

                # Skip attachments
                if "attachment" in content_disposition:
                    continue

                # Get text parts
                if content_type == "text/plain":
                    try:
                        payload = cast(Optional[bytes], part.get_payload(decode=True))
                        if payload:
                            text = payload.decode("utf-8", errors="ignore")
                            text_parts.append(text)
                    except Exception as e:
                        logger.debug(f"Error decoding part: {e}")
                        continue

                elif content_type == "text/html":
                    # Try to extract text from HTML (basic)
                    try:
                        payload = cast(Optional[bytes], part.get_payload(decode=True))
                        if payload:
                            html = payload.decode("utf-8", errors="ignore")
                            # Basic HTML stripping (remove tags)
                            import re
                            text = re.sub(r"<[^>]+>", "", html)
                            text = re.sub(r"\s+", " ", text)
                            if text.strip():
                                text_parts.append(text)
                    except Exception as e:
                        logger.debug(f"Error decoding HTML: {e}")
                        continue

        else:
            # Handle simple messages
            try:
                payload = cast(Optional[bytes], message.get_payload(decode=True))
                if payload:
                    text = payload.decode("utf-8", errors="ignore")
                    text_parts.append(text)
            except Exception as e:
                logger.debug(f"Error decoding message: {e}")

        return "\n".join(text_parts)

    def parse_mbox(self, mbox_path: str) -> str:
        """
        Parse an MBOX file and extract all emails.

        Args:
            mbox_path: Path to MBOX file

        Returns:
            List of dictionaries with email data
        """
        try:
            # Open mbox file
            mbox = mailbox.mbox(mbox_path)

            logger.info(f"Parsing MBOX file: {mbox_path}")

            emails = []

            # Process each message
            for idx, message in enumerate(mbox):
                try:
                    # Extract text content
                    text = self.extract_text_from_email(message)

                    if not text.strip():
                        logger.debug(f"Empty email at index {idx}")
                        continue

                    # Add to results
                    emails.append(text)

                except Exception as e:
                    logger.warning(f"Error processing email {idx}: {e}")
                    continue

            logger.info(f"Extracted {len(emails)} emails from {mbox_path}")

            return ("\n\n" + "="*80 + "\n\n").join(emails)

        except Exception as e:
            logger.error(f"Error reading MBOX file {mbox_path}: {e}")
            return ""
