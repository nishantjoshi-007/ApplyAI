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
        this.checkApiStatus();
    }
    async checkApiStatus() {
        // Show loading status
        this.showApiStatus('Checking Gemini API status...', 'info');
        try {
            const result = await chrome.storage.local.get(['geminiApiKey']);
            const apiKey = result.geminiApiKey;
            if (!apiKey) {
                this.showApiStatus('API key not set', 'error');
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
                this.showApiStatus(`API error: ${errorData.error?.message || 'Unknown error'}`, 'error');
                return;
            }
            const data = await response.json();
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                this.showApiStatus('✅ Gemini API connected', 'success');
            } else {
                this.showApiStatus('API responded, but no valid content', 'error');
            }
        } catch (error) {
            this.showApiStatus('API connection failed: ' + error.message, 'error');
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
            const result = await chrome.storage.local.get(['resume', 'coverLetterTemplate', 'geminiApiKey']);
            
            if (!result.resume || !result.coverLetterTemplate || !result.geminiApiKey) {
                this.showSetupRequired();
                return false;
            }
            
            this.showMainContent();
            return true;
        } catch (error) {
            console.error('Error checking setup:', error);
            this.showStatus('Error checking configuration', 'error');
            return false;
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
            // Check API status again after generation
            await this.checkApiStatus();
        } catch (error) {
            console.error('Error generating cover letter:', error);
            this.showStatus(`Error: ${error.message}`, 'error');
            await this.checkApiStatus();
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
        const result = await chrome.storage.local.get(['resume', 'coverLetterTemplate', 'geminiApiKey', 'coverLetterTones']);
        
        // Build tone instruction
        let toneInstruction = '';
        if (result.coverLetterTones && result.coverLetterTones.length > 0) {
            toneInstruction = `\n7. Write in a ${result.coverLetterTones.join(', ')} tone`;
        }
        
        const prompt = `
You are a professional cover letter writer. Generate a personalized cover letter based on the following:

RESUME:
${result.resume}

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

    showJobInfo(jobDescription) {
        const jobInfoElement = document.getElementById('jobInfo');
        const jobInfoSection = document.getElementById('jobInfoSection');
        
        if (jobInfoElement && jobInfoSection) {
            jobInfoElement.textContent = jobDescription.substring(0, 300) + (jobDescription.length > 300 ? '...' : '');
            jobInfoSection.style.display = 'block';
        }
    }

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
}

// Initialize the extension when popup opens
document.addEventListener('DOMContentLoaded', () => {
    new CoverLetterGenerator();
});
