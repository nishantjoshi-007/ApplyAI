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
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
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
            await this.configureAvailableFeatures(hasApiKey, hasPersonalDetails, hasCoverTemplate);
            return true;
        } catch (error) {
            console.error('Error checking setup:', error);
            this.showStatus('Error checking configuration', 'error');
            return false;
        }
    }

    async configureAvailableFeatures(hasApiKey, hasPersonalDetails, hasCoverTemplate) {
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
            // Check if resume file is available to update button text
            try {
                const result = await chrome.storage.local.get(['resumeFileOriginal']);
                const hasResume = result.resumeFileOriginal;
                
                autofillBtn.style.display = 'block';
                autofillBtn.disabled = false;
                
                if (hasResume) {
                    autofillBtn.textContent = '📝 Autofill Form + Attach Resume';
                    autofillBtn.title = 'Autofill application forms with your profile and attach saved resume';
                } else {
                    autofillBtn.textContent = '📝 Autofill Application Form';
                    autofillBtn.title = 'Autofill application forms with your profile';
                }
            } catch (error) {
                console.error('Error checking resume file:', error);
                autofillBtn.style.display = 'block';
                autofillBtn.disabled = false;
                autofillBtn.textContent = '📝 Autofill Application Form';
                autofillBtn.title = 'Autofill application forms with your profile';
            }
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
                statusMessages.push('⚠️ Add your API key and upload your resume in Settings to enable all features.');
            } else {
                statusMessages.push('⚠️ Upload your resume in Settings to enable cover letter generation and smart autofill.');
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

        document.getElementById('settingsBtn')?.addEventListener('click', () => {
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

        document.getElementById('attachCoverLetterBtn')?.addEventListener('click', () => {
            this.attachCoverLetterToForm();
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
            
            // Update the job info display with the scraped description
            const jobInfoElement = document.getElementById('jobInfo');
            const jobInfoSection = document.getElementById('jobInfoSection');
            if (jobInfoElement && jobInfoSection) {
                jobInfoElement.textContent = jobDescription.substring(0, 300) + (jobDescription.length > 300 ? '...' : '');
                jobInfoSection.style.display = 'block';
            }
            
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

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${result.geminiApiKey}`, {
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
            const result = await chrome.storage.local.get(['personalDetails', 'resumeFileOriginal', 'resumeFileName']);
            
            if (!result.personalDetails || !this.hasRequiredPersonalDetails(result.personalDetails)) {
                this.showAutofillStatus('Please configure your personal details in settings first.', 'error');
                return;
            }

            this.showAutofillStatus('🔍 Scanning page for form fields...', 'info');

            // Get current tab
            const tabs = await chrome.tabs.query({active: true, currentWindow: true});
            const currentTab = tabs[0];

            // First, scan for forms
            const scanResult = await chrome.tabs.sendMessage(currentTab.id, {
                action: 'scanForForms'
            });

            if (scanResult.formInfo.inputsFound === 0) {
                this.showAutofillStatus('❌ No fillable form fields found on this page.', 'error');
                return;
            }

            // Show scan results
            this.displayFormScanResults(scanResult.formInfo);

            // Perform autofill of text fields
            this.showAutofillStatus('📝 Filling form fields...', 'info');
            const autofillResult = await chrome.tabs.sendMessage(currentTab.id, {
                action: 'autofillForm',
                personalDetails: result.personalDetails
            });

            let successMessage = '✅ Form autofilled successfully!';
            let hasResume = result.resumeFileOriginal && result.resumeFileName;

            // Also try to attach resume file if available
            if (hasResume) {
                try {
                    this.showAutofillStatus('📄 Attaching resume file...', 'info');
                    
                    await chrome.scripting.executeScript({
                        target: { tabId: currentTab.id },
                        func: injectResumeFileScript,
                        args: [result.resumeFileOriginal, result.resumeFileName]
                    });

                    successMessage = '✅ Form autofilled and resume attached successfully!';
                } catch (resumeError) {
                    console.error('Error attaching resume during autofill:', resumeError);
                    successMessage = '✅ Form autofilled! (Resume attachment failed - no suitable file upload found)';
                }
            }

            if (autofillResult.success) {
                this.showAutofillStatus(successMessage, 'success');
            } else {
                this.showAutofillStatus('⚠️ Autofill completed with some issues. Please review the form.', 'warning');
            }

        } catch (error) {
            console.error('Error during autofill:', error);
            if (error.message.includes('Could not establish connection')) {
                this.showAutofillStatus('❌ Please refresh the page and try again.', 'error');
            } else {
                this.showAutofillStatus('❌ Error during autofill. Please try again.', 'error');
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

    async attachCoverLetterToForm() {
        try {
            if (!this.generatedCoverLetter) {
                this.showAttachmentStatus('❌ No cover letter generated yet. Generate one first.', 'error');
                return;
            }

            this.showAttachmentStatus('🔍 Creating PDF and searching for cover letter upload fields...', 'info');
            
            // Create PDF from the generated cover letter
            const pdfBlob = await this.createCoverLetterPDF(this.generatedCoverLetter);
            
            // Convert blob to file data for injection
            const fileData = await this.blobToFileData(pdfBlob, 'cover-letter.pdf');
            
            // Inject script to find and populate cover letter file upload fields
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: injectCoverLetterFileScript,
                args: [fileData, 'cover-letter.pdf']
            });

            this.showAttachmentStatus('✅ Cover letter PDF attachment process completed!', 'success');

        } catch (error) {
            console.error('Error attaching cover letter:', error);
            this.showAttachmentStatus('❌ Error attaching cover letter PDF. Please try manually.', 'error');
        }
    }

    async createCoverLetterPDF(coverLetterText) {
        return new Promise((resolve) => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            // Set font and margins
            doc.setFont("times", "normal");
            doc.setFontSize(12);
            
            const margin = 20;
            const pageWidth = 210; // A4 width in mm
            const pageHeight = 297; // A4 height in mm
            const maxLineWidth = pageWidth - (margin * 2);
            
            // Split text into lines that fit the page width
            const lines = doc.splitTextToSize(coverLetterText, maxLineWidth);
            
            let currentY = margin;
            const lineHeight = 7;
            
            lines.forEach((line) => {
                // Check if we need a new page
                if (currentY + lineHeight > pageHeight - margin) {
                    doc.addPage();
                    currentY = margin;
                }
                
                doc.text(line, margin, currentY);
                currentY += lineHeight;
            });
            
            // Convert to blob
            const pdfBlob = doc.output('blob');
            resolve(pdfBlob);
        });
    }

    async blobToFileData(blob, fileName) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
                // Convert blob to base64
                const base64 = reader.result.split(',')[1];
                resolve({
                    data: base64,
                    mimeType: 'application/pdf',
                    name: fileName,
                    size: blob.size
                });
            };
            reader.readAsDataURL(blob);
        });
    }

    injectResumeFile(fileData, fileName) {
        try {
            // Find file upload inputs that might be for resume
            const fileInputs = document.querySelectorAll('input[type="file"]');
            const resumeInputs = Array.from(fileInputs).filter(input => {
                const context = (input.name + ' ' + input.id + ' ' + (input.getAttribute('placeholder') || '') + ' ' + (input.closest('label')?.textContent || '')).toLowerCase();
                return context.includes('resume') || context.includes('cv') || context.includes('upload') || context.includes('attach') || context.includes('file');
            });

            if (resumeInputs.length === 0) {
                // If no specific resume inputs found, try any file input as fallback
                const allFileInputs = Array.from(fileInputs);
                if (allFileInputs.length > 0) {
                    resumeInputs.push(allFileInputs[0]);
                } else {
                    console.log('No file upload fields found on this page.');
                    return false;
                }
            }

            // Convert base64 to File object
            const byteCharacters = atob(fileData.data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const file = new File([byteArray], fileName, { type: fileData.mimeType });

            // Create FileList
            const dt = new DataTransfer();
            dt.items.add(file);

            // Attach to first suitable input
            const targetInput = resumeInputs[0];
            targetInput.files = dt.files;
            targetInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Highlight the field briefly
            targetInput.style.border = '2px solid #007bff';
            targetInput.style.transition = 'border 0.3s ease';
            setTimeout(() => {
                targetInput.style.border = '';
                targetInput.style.transition = '';
            }, 2000);
            
            console.log(`Resume attached successfully: ${fileName}`);
            return true;

        } catch (error) {
            console.error('Error attaching resume file:', error);
            return false;
        }
    }

    injectCoverLetter(coverLetterText) {
        // Find textarea or text inputs that might be for cover letter
        const textInputs = document.querySelectorAll('textarea, input[type="text"]');
        const coverLetterInputs = Array.from(textInputs).filter(input => {
            const context = (input.name + ' ' + input.id + ' ' + (input.getAttribute('placeholder') || '') + ' ' + (input.closest('label')?.textContent || '')).toLowerCase();
            return context.includes('cover') || context.includes('letter') || context.includes('motivation') || context.includes('message') || 
                   (input.tagName.toLowerCase() === 'textarea' && context.includes('additional'));
        });

        if (coverLetterInputs.length === 0) {
            // Fallback: look for large textareas
            const largeTextareas = Array.from(document.querySelectorAll('textarea')).filter(ta => 
                ta.getAttribute('maxlength') > 500 || !ta.getAttribute('maxlength')
            );
            if (largeTextareas.length > 0) {
                coverLetterInputs.push(largeTextareas[0]);
            }
        }

        if (coverLetterInputs.length === 0) {
            alert('No cover letter fields found on this page.');
            return;
        }

        // Attach to first suitable input
        const targetInput = coverLetterInputs[0];
        targetInput.value = coverLetterText;
        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        targetInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Highlight the field briefly
        targetInput.style.border = '2px solid #28a745';
        setTimeout(() => targetInput.style.border = '', 2000);
        
        alert('✅ Cover letter attached to form field!');
    }

    showAttachmentStatus(message, type) {
        const statusElement = document.getElementById('attachmentStatus');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `attachment-status ${type}`;
            statusElement.style.display = 'block';
            
            // Auto-hide after 5 seconds for success/error
            if (type === 'success' || type === 'error') {
                setTimeout(() => {
                    statusElement.style.display = 'none';
                }, 5000);
            }
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

// Standalone functions for injection (these need to be outside the class)
function injectResumeFileScript(fileData, fileName) {
    try {
        // Find file upload inputs that might be for resume
        const fileInputs = document.querySelectorAll('input[type="file"]');
        const resumeInputs = Array.from(fileInputs).filter(input => {
            const context = (input.name + ' ' + input.id + ' ' + (input.getAttribute('placeholder') || '') + ' ' + (input.closest('label')?.textContent || '')).toLowerCase();
            return context.includes('resume') || context.includes('cv') || context.includes('upload') || context.includes('attach') || context.includes('file');
        });

        if (resumeInputs.length === 0) {
            // If no specific resume inputs found, try any file input as fallback
            const allFileInputs = Array.from(fileInputs);
            if (allFileInputs.length > 0) {
                resumeInputs.push(allFileInputs[0]);
            } else {
                console.log('No file upload fields found on this page.');
                return false;
            }
        }

        // Convert base64 to File object
        const byteCharacters = atob(fileData.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const file = new File([byteArray], fileName, { type: fileData.mimeType });

        // Create FileList
        const dt = new DataTransfer();
        dt.items.add(file);

        // Attach to first suitable input
        const targetInput = resumeInputs[0];
        targetInput.files = dt.files;
        targetInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Highlight the field briefly
        targetInput.style.border = '2px solid #007bff';
        targetInput.style.transition = 'border 0.3s ease';
        setTimeout(() => {
            targetInput.style.border = '';
            targetInput.style.transition = '';
        }, 2000);
        
        console.log(`Resume attached successfully: ${fileName}`);
        return true;

    } catch (error) {
        console.error('Error attaching resume file:', error);
        return false;
    }
}

function injectCoverLetterFileScript(fileData, fileName) {
    try {
        // Find file upload inputs that might be for cover letter
        const fileInputs = document.querySelectorAll('input[type="file"]');
        const coverLetterInputs = Array.from(fileInputs).filter(input => {
            const context = (input.name + ' ' + input.id + ' ' + (input.getAttribute('placeholder') || '') + ' ' + (input.closest('label')?.textContent || '')).toLowerCase();
            return context.includes('cover') || context.includes('letter') || context.includes('motivation') || 
                   context.includes('additional') || context.includes('document') || 
                   context.includes('upload') || context.includes('attach') || context.includes('file');
        });

        if (coverLetterInputs.length === 0) {
            // If no specific cover letter inputs found, try any file input as fallback
            // But prioritize ones that are NOT specifically for resume
            const nonResumeInputs = Array.from(fileInputs).filter(input => {
                const context = (input.name + ' ' + input.id + ' ' + (input.getAttribute('placeholder') || '') + ' ' + (input.closest('label')?.textContent || '')).toLowerCase();
                return !context.includes('resume') && !context.includes('cv');
            });
            
            if (nonResumeInputs.length > 0) {
                coverLetterInputs.push(nonResumeInputs[0]);
            } else if (fileInputs.length > 1) {
                // If multiple file inputs, use the second one (first might be for resume)
                coverLetterInputs.push(fileInputs[1]);
            } else {
                console.log('No suitable cover letter upload fields found on this page.');
                return false;
            }
        }

        // Convert base64 to File object
        const byteCharacters = atob(fileData.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const file = new File([byteArray], fileName, { type: fileData.mimeType });

        // Create FileList
        const dt = new DataTransfer();
        dt.items.add(file);

        // Attach to first suitable input
        const targetInput = coverLetterInputs[0];
        targetInput.files = dt.files;
        targetInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Highlight the field briefly
        targetInput.style.border = '2px solid #28a745';
        targetInput.style.transition = 'border 0.3s ease';
        setTimeout(() => {
            targetInput.style.border = '';
            targetInput.style.transition = '';
        }, 2000);
        
        console.log(`Cover letter PDF attached successfully: ${fileName}`);
        return true;

    } catch (error) {
        console.error('Error attaching cover letter file:', error);
        return false;
    }
}
