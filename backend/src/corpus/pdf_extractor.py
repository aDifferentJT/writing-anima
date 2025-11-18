"""PDF text extraction utilities"""

import logging
from typing import Optional

from fastapi import UploadFile

try:
    from pypdf import PdfReader
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False
    logging.warning(
        "pypdf not installed. PDF support disabled. "
        "Install with: pip install pypdf"
    )

logger = logging.getLogger(__name__)


class PDFExtractor:  # pylint: disable=too-few-public-methods
    """Extract text from PDF files using pypdf"""

    def __init__(self) -> None:
        """Initialize PDF extractor"""
        if not PDF_AVAILABLE:
            raise ImportError(
                "pypdf is required for PDF support. "
                "Install with: pip install pypdf"
            )

    def extract_text(self, file: UploadFile) -> Optional[str]:
        """
        Extract all text from a PDF file.

        Args:
            file: PDF file

        Returns:
            Extracted text or None if extraction fails
        """
        try:
            reader = PdfReader(file.file)

            if reader.is_encrypted:
                logger.warning("PDF is encrypted: %s", file.filename)
                return None

            # Extract text from all pages
            text_parts = []
            for page_num, page in enumerate(reader.pages, 1):
                try:
                    page_text = page.extract_text()
                    if page_text:
                        text_parts.append(page_text)
                    else:
                        logger.debug("No text on page %d of %s", page_num, file.filename)
                except Exception as e:  # pylint: disable=broad-exception-caught
                    logger.warning(
                        "Error extracting page %d from %s: %s",
                        page_num, file.filename, e
                    )
                    continue

            if not text_parts:
                logger.warning("No text extracted from PDF: %s", file.filename)
                return None

            # Join all pages with double newline
            full_text = "\n\n".join(text_parts)

            logger.info(
                "Extracted %d characters from %d pages in %s",
                len(full_text), len(text_parts), file.filename
            )

            return full_text

        except Exception as e:  # pylint: disable=broad-exception-caught
            logger.error("Error reading PDF %s: %s", file.filename, e)
            return None

def is_pdf_available() -> bool:
    """Check if PDF support is available"""
    return PDF_AVAILABLE
