# ApplyAI Chrome Extension

A Chrome extension that generates personalized cover letters from job descriptions using Google's Gemini AI.

## Features

- 🎯 **Smart Job Description Extraction**: Automatically extracts job descriptions from popular job sites (LinkedIn, Indeed, Glassdoor, etc.)
- 🤖 **AI-Powered Generation**: Uses Google Gemini API to create personalized cover letters
- 📄 **Template-Based**: Uses your custom cover letter template and resume for consistent, personalized results
- 🎭 **Tone Customization**: Choose from pre-defined tones or create custom tones for your cover letters
- 🧠 **Smart Resume Import**: Import personal details from your resume using AI
- 💾 **Local Storage**: All your data (resume, template, API key, personal details) is stored locally in your browser
- 📥 **Multiple Download Formats**: Download generated cover letters as TXT, PDF, or DOCX files
- ⚙️ **Easy Settings Access**: Quick access to settings from the popup with a convenient settings button
- 📋 **Privacy & Terms**: Built-in privacy policy and terms of service for transparency

## Setup Instructions

### 1. Get a Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the generated key

### 2. Install ApplyAI

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the extension folder

### 3. Configure Settings

1. Click the ApplyAI extension icon in your Chrome toolbar
2. Click the **settings button** (⚙️) in the top-right of the popup, or right-click the extension icon and select "Options"
3. Enter your Gemini API key
4. Paste your complete resume content
5. Customize the cover letter template (or use the provided default)
6. Choose your preferred tone(s) for the cover letters (up to 3)
7. **Fill Personal Details**: Complete your personal information for various use cases (or use "Import from Resume" for AI assistance)
8. Click "Save Settings" and test the configuration

## How to Use

### For Cover Letter Generation:

1. **Navigate to a Job Posting**: Go to any job posting on LinkedIn, Indeed, Glassdoor, or other job sites
2. **Click ApplyAI**: Click the ApplyAI extension icon in your Chrome toolbar
3. **Generate Cover Letter**: Click "Generate Cover Letter" button
4. **Review and Download**: Review the generated cover letter and download it as TXT, PDF, or DOCX

### Accessing Settings:

1. **From Popup**: Click the ApplyAI extension icon, then click the settings button (⚙️) in the top-right corner
2. **From Context Menu**: Right-click the ApplyAI extension icon and select "Options"
3. **Legal Documents**: Access Privacy Policy and Terms of Service from the settings page footer

## Supported Job Sites

- LinkedIn Jobs
- Indeed
- Glassdoor
- AngelList/Wellfound
- Most other job posting websites (generic extraction)

## Tech Stack

- **Frontend**: HTML, CSS, JavaScript (Vanilla)
- **Extension**: Chrome Extension Manifest V3
- **AI**: Google Gemini API
- **Storage**: Chrome Storage API
- **File Generation**: JavaScript Blob API

## File Structure

```
ApplyAI/
├── manifest.json              # Extension configuration
├── src/                       # Source code
│   ├── pages/                 # HTML pages and their scripts
│   │   ├── popup.html & popup.js      # Main extension popup
│   │   ├── options.html & options.js  # Settings page
│   │   ├── preview.html & preview.js  # Cover letter preview window
│   │   ├── privacy.html               # Privacy policy page
│   │   └── terms.html                 # Terms of service page
│   ├── scripts/               # Background and content scripts
│   │   ├── background.js      # Background service worker
│   │   └── content.js         # Job description extraction
│   └── styles/                # CSS stylesheets
│       └── main.css          # Main stylesheet for all pages
├── lib/                       # Third-party libraries
│   ├── jspdf.umd.min.js      # PDF generation library
│   ├── docx.umd.min.js       # DOCX generation library
│   ├── mammoth.browser.min.js # DOCX parsing library
│   ├── pdf.js                # PDF parsing library
│   └── pdf.worker.js         # PDF.js worker
├── assets/                    # Static assets
│   └── icons/                # Extension icons (16x16, 32x32, 48x48, 128x128)
├── LICENSE                   # MIT License
├── README.md                # This file
├── CONTRIBUTING.md          # Contribution guidelines
└── SECURITY.md             # Security policy
```

## Required Libraries

Due to file size limitations, you'll need to download these libraries separately:

### For PDF/DOCX Export:

- **jsPDF**: Download `jspdf.umd.min.js` from [jsPDF Releases](https://github.com/parallax/jsPDF/releases)
- **docx.js**: Download `docx.umd.min.js` from [docx Releases](https://github.com/dolanmiu/docx/releases)

### For File Upload Parsing:

- **PDF.js**: Download `pdf.js` and `pdf.worker.js` from [PDF.js Releases](https://github.com/mozilla/pdf.js/releases)
- **Mammoth.js**: Download `mammoth.browser.min.js` from [Mammoth.js Releases](https://github.com/mwilliamson/mammoth.js/releases)

Place all downloaded files in the `lib/` directory.

## Privacy & Security

- All data is stored locally in your browser
- Your API key and personal information never leave your device
- The extension only communicates with Google's Gemini API
- No data is collected or transmitted to third parties

## Development

To modify or enhance the extension:

1. Make your changes to the source files
2. Go to `chrome://extensions/`
3. Click the reload icon next to your extension
4. Test your changes

## Future Enhancements

- Enhanced job site compatibility
- Multiple cover letter templates
- Integration with popular job tracking tools
- Batch processing for multiple applications
- Cover letter analytics and optimization suggestions

## Troubleshooting

### Extension Not Working

- Check that Developer mode is enabled in Chrome
- Verify all files are in the extension folder
- Check the Chrome Developer Console for errors
- Ensure all required libraries are downloaded and placed in the correct location

### API Errors

- Verify your Gemini API key is correct and active
- Check your internet connection
- Ensure you haven't exceeded API rate limits
- Try regenerating your API key if issues persist

### Job Description Not Extracted

- Try refreshing the page and clicking the extension again
- Some sites may require scrolling to load content
- Check if the job description is in a popup or expandable section
- Manually copy and paste job description if auto-extraction fails

### Download Issues

- Ensure jsPDF and docx.js libraries are properly downloaded
- Check browser permissions for file downloads
- Try different download formats (TXT, PDF, DOCX)

## Contributing

We welcome contributions! Please feel free to:

- Report bugs by opening an issue
- Suggest new features via GitHub issues
- Submit pull requests for bug fixes or enhancements
- Improve documentation
- Add support for additional job sites

### Development Setup

1. Fork this repository
2. Clone your fork locally
3. Make your changes
4. Test thoroughly with the Chrome extension
5. Submit a pull request with a clear description

## License

MIT License - see [LICENSE](LICENSE) file for details.

This project is for educational and personal use. Please respect the terms of service of job sites and the Gemini API when using this extension.
