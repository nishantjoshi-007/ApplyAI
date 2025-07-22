// Preview window functionality
document.addEventListener("DOMContentLoaded", async function () {
  // Get the preview ID from URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const previewId = urlParams.get("id");

  if (previewId) {
    try {
      // Get the letter content from storage
      const result = await chrome.storage.local.get([previewId]);
      const letter = result[previewId] || "";

      // Display the letter
      const letterContent = document.getElementById("letterContent");
      if (letterContent && letter) {
        letterContent.textContent = letter;
      }

      // Clean up the temporary storage after a delay
      setTimeout(async () => {
        await chrome.storage.local.remove([previewId]);
      }, 60000); // Clean up after 1 minute
    } catch (error) {
      console.error("Error loading preview content:", error);
    }
  }

  // Bind download event handlers
  const txtBtn = document.getElementById("downloadTXT");
  const pdfBtn = document.getElementById("downloadPDF");
  const docxBtn = document.getElementById("downloadDOCX");
  const closeBtn = document.getElementById("closeBtn");

  if (txtBtn) {
    txtBtn.addEventListener("click", downloadLetterTXT);
  }

  if (pdfBtn) {
    pdfBtn.addEventListener("click", downloadLetterPDF);
  }

  if (docxBtn) {
    docxBtn.addEventListener("click", downloadLetterDOCX);
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", function () {
      window.close();
    });
  }
});

function downloadLetterTXT() {
  const text = document.getElementById("letterContent").innerText;
  const blob = new Blob([text], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "cover-letter.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function downloadLetterPDF() {
  try {
    if (window.jspdf && window.jspdf.jsPDF) {
      const doc = new window.jspdf.jsPDF();
      const text = document.getElementById("letterContent").innerText;
      const lines = doc.splitTextToSize(text, 180);
      doc.text(lines, 10, 20);
      doc.save("cover-letter.pdf");
    } else {
      alert("jsPDF library not loaded. Downloading as TXT instead.");
      downloadLetterTXT();
    }
  } catch (error) {
    console.error("PDF download error:", error);
    alert("PDF download failed. Downloading as TXT instead.");
    downloadLetterTXT();
  }
}

function downloadLetterDOCX() {
  try {
    if (window.docx && window.docx.Document) {
      const { Document, Packer, Paragraph, TextRun } = window.docx;
      const text = document.getElementById("letterContent").innerText;
      const paragraphs = text.split("\n\n").map(
        (para) =>
          new Paragraph({
            children: [new TextRun(para)],
          })
      );
      const doc = new Document({
        sections: [
          {
            properties: {},
            children: paragraphs,
          },
        ],
      });

      Packer.toBlob(doc)
        .then((blob) => {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "cover-letter.docx";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        })
        .catch((error) => {
          console.error("DOCX generation error:", error);
          alert("DOCX download failed. Downloading as TXT instead.");
          downloadLetterTXT();
        });
    } else {
      alert("docx.js library not loaded. Downloading as TXT instead.");
      downloadLetterTXT();
    }
  } catch (error) {
    console.error("DOCX download error:", error);
    alert("DOCX download failed. Downloading as TXT instead.");
    downloadLetterTXT();
  }
}
