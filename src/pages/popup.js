// Main popup script
class CoverLetterGenerator {

    constructor() {
        this.currentJobDescription = '';
        this.generatedCoverLetter = '';
        this.apiStatus = { status: 'unknown', message: '', type: 'info' };
        this.init();
    }

    async init() {
        await this.checkSetup();
        this.bindEvents();
        this.showDetectedJobDescription();
        // Only check API status if user is about to generate a cover letter, not on every popup open
    }

    async showDetectedJobDescription() {
        // Always try to scrape and show the job description
        const jobDescription = await this.scrapeJobDescription();
        const jobInfoElement = document.getElementById('jobInfo');
        const jobInfoSection = document.getElementById('jobInfoSection');
        if (jobInfoElement && jobInfoSection) {
            if (jobDescription && jobDescription !== 'Could not extract job description') {
                jobInfoElement.textContent = jobDescription.substring(0, 300) + (jobDescription.length > 300 ? '...' : '');
                jobInfoSection.style.display = 'block';
            } else {
                jobInfoElement.textContent = 'No job description detected on this page.';
                jobInfoSection.style.display = 'block';
            }
        }
    }
    async checkApiStatus() {
        // Show API status in statusMessage, not apiStatusBar
        this.showStatus('Checking Gemini API status...', 'info');
        try {
            const result = await chrome.storage.local.get(['geminiApiKey']);
            const apiKey = result.geminiApiKey;
            if (!apiKey) {
                this.showStatus('API key not set', 'error');
                return;
            }
            // Use Gemini 2.0 Flash Experimental endpoint
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: 'Ping' }] }],
                    generationConfig: { temperature: 0.1, maxOutputTokens: 5 }
                })
            });
            if (!response.ok) {
                const errorData = await response.json();
                this.showStatus(`API error: ${errorData.error?.message || 'Unknown error'}`, 'error');
                return;
            }
            const data = await response.json();
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                this.showStatus('✅ Gemini API connected', 'success');
            } else {
                this.showStatus('API responded, but no valid content', 'error');
            }
        } catch (error) {
            this.showStatus('API connection failed: ' + error.message, 'error');
        }
    }

    showApiStatus(message, type) {
        const bar = document.getElementById('apiStatusBar');
        if (bar) {
            bar.textContent = message;
            bar.className = `status ${type}`;
            bar.style.display = 'block';
        }
    }

    async checkSetup() {
        try {
            const result = await chrome.storage.local.get(['coverLetterTemplate', 'geminiApiKey', 'personalDetails']);
            
            // Check what features are available
            const hasApiKey = result.geminiApiKey && result.geminiApiKey.trim();
            const hasCoverTemplate = result.coverLetterTemplate && result.coverLetterTemplate.trim();
            const hasPersonalDetails = result.personalDetails && Object.keys(result.personalDetails).some(key => result.personalDetails[key]);
            
            // Show setup required only if nothing is configured
            if (!hasApiKey && !hasCoverTemplate && !hasPersonalDetails) {
                this.showSetupRequired();
                return false;
            }
            
            // Show main content and conditionally display features
            this.showMainContent();
            this.configureAvailableFeatures(hasApiKey, hasPersonalDetails, hasCoverTemplate);
            return true;
        } catch (error) {
            console.error('Error checking setup:', error);
            this.showStatus('Error checking configuration', 'error');
            return false;
        }
    }

    configureAvailableFeatures(hasApiKey, hasPersonalDetails, hasCoverTemplate) {
        const generateBtn = document.getElementById('generateBtn');
        const autofillBtn = document.getElementById('autofillBtn');
        const divider = document.querySelector('.divider');
        
        // Configure cover letter generation (API key AND personal details required)
        if (hasApiKey && hasPersonalDetails) {
            generateBtn.style.display = 'block';
            generateBtn.disabled = false;
            generateBtn.title = 'Cover letter generation available';
        } else {
            generateBtn.style.display = 'none';
        }

        // Configure autofill functionality (personal details required)
        if (hasPersonalDetails) {
            autofillBtn.style.display = 'block';
            autofillBtn.disabled = false;
            autofillBtn.title = 'Autofill application forms with your profile';
        } else {
            autofillBtn.style.display = 'none';
        }
        
        // Show/hide divider based on what's visible
        if (generateBtn.style.display === 'block' && autofillBtn.style.display === 'block') {
            divider.style.display = 'block';
        } else {
            divider.style.display = 'none';
        }
        
        // Show status message about available features
        this.showFeatureStatus(hasApiKey, hasPersonalDetails);
    }

    showFeatureStatus(hasApiKey, hasPersonalDetails) {
        let statusMessages = [];

        // Cover letter generation status
        if (!hasPersonalDetails) {
            if (!hasApiKey) {
                statusMessages.push('⚠️ Add your API key and upload your resume in Settings to enable cover letter generation.');
            } else {
                statusMessages.push('⚠️ Upload your resume in Settings to enable cover letter generation and autofill.');
            }
        } else if (!hasApiKey) {
            statusMessages.push('⚠️ Add your API key to enable cover letter generation.');
        }

        // If both features are available, show a success message
        if (hasApiKey && hasPersonalDetails) {
            statusMessages.push('✅ All features enabled!');
        }

        const statusDiv = document.getElementById('apiStatusBar');
        if (statusMessages.length > 0) {
            statusDiv.innerHTML = statusMessages.join('<br>');
            statusDiv.style.display = 'block';
            statusDiv.className = 'status info';
        } else {
            statusDiv.style.display = 'none';
        }
    }

    showSetupRequired() {
        document.getElementById('setupRequired').style.display = 'block';
        document.getElementById('mainContent').style.display = 'none';
    }

    showMainContent() {
        document.getElementById('setupRequired').style.display = 'none';
        document.getElementById('mainContent').style.display = 'block';
    }

    bindEvents() {
        document.getElementById('openOptionsBtn')?.addEventListener('click', () => {
            chrome.runtime.openOptionsPage();
        });

        document.getElementById('generateBtn')?.addEventListener('click', () => {
            this.generateCoverLetter();
        });

        document.getElementById('autofillBtn')?.addEventListener('click', () => {
            this.handleAutofill();
        });

        document.getElementById('downloadBtn')?.addEventListener('click', () => {
            this.downloadPDF();
        });

        document.getElementById('regenerateBtn')?.addEventListener('click', () => {
            // Show the generate button again for new generation
            const generateBtn = document.getElementById('generateBtn');
            if (generateBtn) generateBtn.style.display = 'block';
            this.generateCoverLetter();
        });
    }

    async generateCoverLetter() {
        try {
            this.showLoading(true);
            this.showStatus('', '');
            // Hide the cover letter preview while generating
            const resultSection = document.getElementById('resultSection');
            if (resultSection) resultSection.style.display = 'none';
            // Check API status before generating
            await this.checkApiStatus();
            // Get job description from current page
            const jobDescription = await this.scrapeJobDescription();
            if (!jobDescription) {
                throw new Error('Could not extract job description from this page');
            }
            this.currentJobDescription = jobDescription;
            this.showJobInfo(jobDescription);
            // Generate cover letter using Gemini API
            const coverLetter = await this.callGeminiAPI(jobDescription);
            this.generatedCoverLetter = coverLetter;
            this.showResult(coverLetter);
            this.showStatus('Cover letter generated successfully! 🎉', 'success');
            // Hide the generate button after success
            const generateBtn = document.getElementById('generateBtn');
            if (generateBtn) generateBtn.style.display = 'none';
        } catch (error) {
            console.error('Error generating cover letter:', error);
            this.showStatus(`Error: ${error.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async scrapeJobDescription() {
        return new Promise((resolve) => {
            chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
                try {
                    const result = await chrome.scripting.executeScript({
                        target: {tabId: tabs[0].id},
                        function: () => {
                            // Try multiple strategies to extract job description
                            const selectors = [
                                '.job-description',
                                '.job-details',
                                '[data-testid="job-description"]',
                                '.description',
                                '.job-summary',
                                '.posting-description',
                                '.job-posting-details',
                                '.job-content',
                                '.position-description'
                            ];

                            let jobText = '';

                            // Try specific selectors first
                            for (const selector of selectors) {
                                const element = document.querySelector(selector);
                                if (element) {
                                    jobText = element.innerText.trim();
                                    if (jobText.length > 100) {
                                        return jobText;
                                    }
                                }
                            }

                            // Fallback: look for long text blocks
                            const textElements = document.querySelectorAll('p, div, section');
                            let longestText = '';
                            
                            textElements.forEach(el => {
                                const text = el.innerText.trim();
                                if (text.length > longestText.length && text.length > 200) {
                                    // Check if it contains job-related keywords
                                    const jobKeywords = ['position', 'role', 'responsibility', 'requirement', 'experience', 'skill', 'job', 'career'];
                                    const lowerText = text.toLowerCase();
                                    if (jobKeywords.some(keyword => lowerText.includes(keyword))) {
                                        longestText = text;
                                    }
                                }
                            });

                            return longestText || jobText || 'Could not extract job description';
                        }
                    });

                    resolve(result[0]?.result || '');
                } catch (error) {
                    console.error('Error scraping job description:', error);
                    resolve('');
                }
            });
        });
    }

    async callGeminiAPI(jobDescription) {
        const result = await chrome.storage.local.get(['personalDetails', 'coverLetterTemplate', 'geminiApiKey', 'coverLetterTones']);

        // Build resume content from profile fields
        let resumeContent = '';
        if (result.personalDetails) {
            const pd = result.personalDetails;
            resumeContent = `Name: ${pd.firstName || ''} ${pd.lastName || ''}\nEmail: ${pd.email || ''}`;
            if (pd.phone) resumeContent += `\nPhone: ${pd.phone}`;
            if (pd.address) resumeContent += `\nAddress: ${pd.address}`;
            if (pd.summary) resumeContent += `\nSummary: ${pd.summary}`;
            if (pd.experience) resumeContent += `\nExperience: ${pd.experience}`;
            if (pd.education) resumeContent += `\nEducation: ${pd.education}`;
            if (pd.skills) resumeContent += `\nSkills: ${pd.skills}`;
            // Add any other fields as needed
        }

        // Build tone instruction
        let toneInstruction = '';
        if (result.coverLetterTones && result.coverLetterTones.length > 0) {
            toneInstruction = `\n7. Write in a ${result.coverLetterTones.join(', ')} tone`;
        }

        const prompt = `
You are a professional cover letter writer. Generate a personalized cover letter based on the following:

RESUME:
${resumeContent}

COVER LETTER TEMPLATE:
${result.coverLetterTemplate}

JOB DESCRIPTION:
${jobDescription}

Instructions:
1. Use the provided resume information to highlight relevant experience
2. Follow the structure and tone of the cover letter template
3. Customize the content to match the specific job description
4. Keep it professional and concise (3-4 paragraphs)
5. Make it compelling and show enthusiasm for the role
6. Include specific examples from the resume that match job requirements${toneInstruction}

Generate only the cover letter content, no additional commentary.
        `.trim();

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${result.geminiApiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 1024,
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Gemini API error: ${errorData.error?.message || 'Unknown error'}`);
        }

        const data = await response.json();

        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            throw new Error('Invalid response from Gemini API');
        }

        return data.candidates[0].content.parts[0].text;
    }

    // showJobInfo is now handled by showDetectedJobDescription always

    showResult(coverLetter) {
        const resultSection = document.getElementById('resultSection');
        const previewElement = document.getElementById('coverLetterPreview');
        if (resultSection && previewElement) {
            previewElement.textContent = coverLetter;
            resultSection.style.display = 'block';
        }
        // Add or update the 'Open in New Window' button
        let openBtn = document.getElementById('openInNewWindowBtn');
        if (!openBtn) {
            openBtn = document.createElement('button');
            openBtn.id = 'openInNewWindowBtn';
            openBtn.className = 'button secondary';
            openBtn.style.marginTop = '10px';
            openBtn.textContent = '🗔 Open in New Window';
            // Insert after preview
            previewElement.parentNode.insertBefore(openBtn, previewElement.nextSibling);
        }
        openBtn.onclick = async () => {
            await this.openCoverLetterInNewWindow();
        };
    }

    async openCoverLetterInNewWindow() {
        const letter = this.generatedCoverLetter || '';
        if (!letter) return;
        
        // Store the letter content temporarily
        const previewId = 'preview_' + Date.now();
        await chrome.storage.local.set({ [previewId]: letter });
        
        // Open preview with the ID
        const url = chrome.runtime.getURL(`src/pages/preview.html?id=${previewId}`);
        window.open(url, '_blank', 'width=600,height=800');
    }

    showLoading(show) {
        const loadingSection = document.getElementById('loadingSection');
        const generateSection = document.getElementById('generateSection');
        
        if (loadingSection && generateSection) {
            loadingSection.style.display = show ? 'block' : 'none';
            generateSection.style.display = show ? 'none' : 'block';
        }
    }

    showStatus(message, type) {
        const statusElement = document.getElementById('statusMessage');
        
        if (statusElement && message) {
            statusElement.textContent = message;
            statusElement.className = `status ${type}`;
            statusElement.style.display = 'block';
            
            // Auto-hide success messages after 3 seconds
            if (type === 'success') {
                setTimeout(() => {
                    statusElement.style.display = 'none';
                }, 3000);
            }
        } else if (statusElement) {
            statusElement.style.display = 'none';
        }
    }

    async downloadPDF() {
        if (!this.generatedCoverLetter) {
            this.showStatus('No cover letter to download', 'error');
            return;
        }
        try {
            if (window.jspdf && window.jspdf.jsPDF) {
                const doc = new window.jspdf.jsPDF();
                const lines = doc.splitTextToSize(this.generatedCoverLetter, 180);
                doc.text(lines, 10, 20);
                doc.save(`cover-letter-${new Date().toISOString().split('T')[0]}.pdf`);
                this.showStatus('Cover letter PDF downloaded! 📥', 'success');
            } else {
                // fallback to txt
                const element = document.createElement('a');
                const file = new Blob([this.generatedCoverLetter], {type: 'text/plain'});
                element.href = URL.createObjectURL(file);
                element.download = `cover-letter-${new Date().toISOString().split('T')[0]}.txt`;
                document.body.appendChild(element);
                element.click();
                document.body.removeChild(element);
                this.showStatus('Cover letter downloaded as TXT (PDF unavailable)', 'success');
            }
        } catch (error) {
            console.error('Error downloading cover letter:', error);
            this.showStatus('Error downloading cover letter', 'error');
        }
    }

    // Autofill Methods
    async handleAutofill() {
        try {
            // Check if personal details are configured
            const result = await chrome.storage.local.get(['personalDetails']);
            
            if (!result.personalDetails || !this.hasRequiredPersonalDetails(result.personalDetails)) {
                this.showAutofillStatus('Please configure your personal details in settings first.', 'error');
                return;
            }

            this.showAutofillStatus('Scanning page for form fields...', 'info');

            // Get current tab
            const tabs = await chrome.tabs.query({active: true, currentWindow: true});
            const currentTab = tabs[0];

            // First, scan for forms
            const scanResult = await chrome.tabs.sendMessage(currentTab.id, {
                action: 'scanForForms'
            });

            if (scanResult.formInfo.inputsFound === 0) {
                this.showAutofillStatus('No fillable form fields found on this page.', 'error');
                return;
            }

            // Show scan results
            this.displayFormScanResults(scanResult.formInfo);

            // Perform autofill
            const autofillResult = await chrome.tabs.sendMessage(currentTab.id, {
                action: 'autofillForm',
                personalDetails: result.personalDetails
            });

            if (autofillResult.success) {
                this.showAutofillStatus('Form autofill completed successfully!', 'success');
            } else {
                this.showAutofillStatus('Autofill completed with some issues. Please review the form.', 'warning');
            }

        } catch (error) {
            console.error('Error during autofill:', error);
            if (error.message.includes('Could not establish connection')) {
                this.showAutofillStatus('Please refresh the page and try again.', 'error');
            } else {
                this.showAutofillStatus('Error during autofill. Please try again.', 'error');
            }
        }
    }

    hasRequiredPersonalDetails(personalDetails) {
        const requiredFields = ['firstName', 'lastName', 'email'];
        return requiredFields.every(field => personalDetails[field] && personalDetails[field].trim());
    }

    showAutofillStatus(message, type) {
        const statusElement = document.getElementById('autofillStatus');
        const resultElement = document.getElementById('formScanResult');
        
        if (statusElement && resultElement) {
            resultElement.innerHTML = `
                <div class="autofill-message ${type}">
                    ${this.getStatusIcon(type)} ${message}
                </div>
            `;
            statusElement.className = `autofill-status ${type}`;
            statusElement.style.display = 'block';

            // Auto-hide after 5 seconds for success messages
            if (type === 'success') {
                setTimeout(() => {
                    statusElement.style.display = 'none';
                }, 5000);
            }
        }
    }

    displayFormScanResults(formInfo) {
        const resultElement = document.getElementById('formScanResult');
        
        if (resultElement) {
            const detectedFieldsText = formInfo.detectedFields.length > 0 
                ? formInfo.detectedFields.slice(0, 3).map(field => field.type).join(', ') + 
                  (formInfo.detectedFields.length > 3 ? '...' : '')
                : 'None detected';

            resultElement.innerHTML = `
                <div class="form-scan-info">
                    <div><strong>📊 Form Analysis:</strong></div>
                    <div>• Forms found: ${formInfo.formsFound}</div>
                    <div>• Input fields: ${formInfo.inputsFound}</div>
                    <div>• Detected fields: ${detectedFieldsText}</div>
                </div>
            `;
        }
    }

    getStatusIcon(type) {
        const icons = {
            'info': '🔍',
            'success': '✅',
            'error': '❌',
            'warning': '⚠️'
        };
        return icons[type] || '🔍';
    }
}

// Initialize the extension when popup opens
document.addEventListener('DOMContentLoaded', () => {
    new CoverLetterGenerator();
});
