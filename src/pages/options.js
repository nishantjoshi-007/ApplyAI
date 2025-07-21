// Options page script
class SettingsManager {
    constructor() {
        this.selectedTones = [];
        this.maxTones = 3;
        this.init();
    }

    async init() {
        await this.loadSettings();
        this.bindEvents();
        this.setupFileUploads();
        this.setupToneSelection();
    }

    setupFileUploads() {
        // Resume file upload
        const resumeFile = document.getElementById('resumeFile');
        if (resumeFile) {
            resumeFile.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    const text = await this.parseFile(file);
                    if (text) document.getElementById('resume').value = text;
                }
            });
        }
        // Template file upload
        const templateFile = document.getElementById('templateFile');
        if (templateFile) {
            templateFile.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    const text = await this.parseFile(file);
                    if (text) document.getElementById('coverLetterTemplate').value = text;
                }
            });
        }
    }

    async parseFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'txt') {
            return await file.text();
        }
        if (ext === 'pdf') {
            return await this.parsePdfFile(file);
        }
        if (ext === 'docx') {
            return await this.parseDocxFile(file);
        }
        // Fallback: try as text
        return await file.text();
    }

    async parsePdfFile(file) {
        // Use pdf.js (must be included in extension)
        if (window['pdfjsLib']) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = '../../lib/pdf.worker.js';
        }
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const pdfjsLib = window['pdfjsLib'];
                    if (!pdfjsLib) {
                        alert('PDF.js library not loaded.');
                        resolve('');
                        return;
                    }
                    const typedarray = new Uint8Array(e.target.result);
                    const pdf = await pdfjsLib.getDocument({data: typedarray}).promise;
                    let text = '';
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const content = await page.getTextContent();
                        text += content.items.map(item => item.str).join(' ') + '\n';
                    }
                    resolve(text.trim());
                } catch (err) {
                    alert('Failed to parse PDF: ' + err.message);
                    resolve('');
                }
            };
            reader.readAsArrayBuffer(file);
        });
    }

    async parseDocxFile(file) {
        // Use mammoth.js (must be included in extension)
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const mammoth = window['mammoth'];
                    if (!mammoth) {
                        alert('Mammoth.js library not loaded.');
                        resolve('');
                        return;
                    }
                    const arrayBuffer = e.target.result;
                    const result = await mammoth.extractRawText({arrayBuffer});
                    resolve(result.value.trim());
                } catch (err) {
                    alert('Failed to parse DOCX: ' + err.message);
                    resolve('');
                }
            };
            reader.readAsArrayBuffer(file);
        });
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.local.get(['resume', 'coverLetterTemplate', 'geminiApiKey', 'coverLetterTones']);
            
            if (result.resume) {
                document.getElementById('resume').value = result.resume;
            }
            
            if (result.coverLetterTemplate) {
                document.getElementById('coverLetterTemplate').value = result.coverLetterTemplate;
            }
            
            if (result.geminiApiKey) {
                document.getElementById('geminiApiKey').value = result.geminiApiKey;
            }

            // Load selected tones
            if (result.coverLetterTones) {
                this.selectedTones = result.coverLetterTones;
                this.updateToneSelection();
            }

            // Set default template if none exists
            if (!result.coverLetterTemplate) {
                this.setDefaultTemplate();
            }
            
        } catch (error) {
            console.error('Error loading settings:', error);
            this.showStatus('Error loading settings', 'error');
        }
    }

    setDefaultTemplate() {
        const defaultTemplate = `Dear Hiring Manager,

I am writing to express my strong interest in the [Position] role at [Company Name]. With my background in software development and proven track record of delivering high-quality solutions, I am confident that I would be a valuable addition to your team.

In my current role, I have successfully [Key Achievement/Experience]. This experience has prepared me well for the challenges described in your job posting, particularly [Specific Requirement from Job Description]. I am passionate about creating innovative solutions and collaborating with cross-functional teams to achieve business objectives.

I am particularly excited about the opportunity to contribute to [Company Name]'s mission and would welcome the chance to discuss how my skills and enthusiasm can drive your team's continued success.

Thank you for your consideration. I look forward to hearing from you.

Sincerely,
[Your Name]`;

        document.getElementById('coverLetterTemplate').value = defaultTemplate;
    }

    bindEvents() {
        document.getElementById('settingsForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSettings();
        });

        document.getElementById('testBtn').addEventListener('click', () => {
            this.testConfiguration();
        });
    }

    async saveSettings() {
        try {
            const resume = document.getElementById('resume').value.trim();
            const coverLetterTemplate = document.getElementById('coverLetterTemplate').value.trim();
            const geminiApiKey = document.getElementById('geminiApiKey').value.trim();

            // Validation
            if (!resume) {
                this.showStatus('Please enter your resume content', 'error');
                return;
            }

            if (!coverLetterTemplate) {
                this.showStatus('Please enter a cover letter template', 'error');
                return;
            }

            if (!geminiApiKey) {
                this.showStatus('Please enter your Gemini API key', 'error');
                return;
            }

            // Basic API key format validation
            if (!geminiApiKey.startsWith('AIzaSy') || geminiApiKey.length < 30) {
                this.showStatus('Invalid API key format. Gemini API keys should start with "AIzaSy"', 'error');
                return;
            }

            // Save to storage
            await chrome.storage.local.set({
                resume: resume,
                coverLetterTemplate: coverLetterTemplate,
                geminiApiKey: geminiApiKey,
                coverLetterTones: this.selectedTones
            });

            this.showStatus('Settings saved successfully! 🎉', 'success');

        } catch (error) {
            console.error('Error saving settings:', error);
            this.showStatus('Error saving settings', 'error');
        }
    }

    async testConfiguration() {
        try {
            const geminiApiKey = document.getElementById('geminiApiKey').value.trim();
            
            if (!geminiApiKey) {
                this.showStatus('Please enter your Gemini API key first', 'error');
                return;
            }

            this.showStatus('Testing API connection...', 'info');

            // Test API call
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: 'Hello, this is a test. Please respond with "API connection successful".'
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 50,
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API Error: ${errorData.error?.message || 'Unknown error'}`);
            }

            const data = await response.json();
            
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                this.showStatus('✅ API connection successful! Your configuration is working.', 'success');
            } else {
                throw new Error('Invalid response from API');
            }

        } catch (error) {
            console.error('Error testing configuration:', error);
            this.showStatus(`❌ API test failed: ${error.message}`, 'error');
        }
    }

    setupToneSelection() {
        // Handle tone checkboxes
        const toneCheckboxes = document.querySelectorAll('input[name="tones"]');
        toneCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    if (this.selectedTones.length >= this.maxTones) {
                        e.target.checked = false;
                        this.showStatus(`You can select up to ${this.maxTones} tones only`, 'error');
                        return;
                    }
                    this.selectedTones.push(e.target.value);
                } else {
                    this.selectedTones = this.selectedTones.filter(tone => tone !== e.target.value);
                }
                this.updateToneDisplay();
            });
        });

        // Handle custom tone addition
        const addCustomToneBtn = document.getElementById('addCustomToneBtn');
        const customToneInput = document.getElementById('customTone');
        
        addCustomToneBtn.addEventListener('click', () => {
            const customTone = customToneInput.value.trim();
            if (!customTone) {
                this.showStatus('Please enter a custom tone', 'error');
                return;
            }
            
            if (this.selectedTones.length >= this.maxTones) {
                this.showStatus(`You can select up to ${this.maxTones} tones only`, 'error');
                return;
            }

            if (this.selectedTones.includes(customTone)) {
                this.showStatus('This tone is already selected', 'error');
                return;
            }

            this.selectedTones.push(customTone);
            customToneInput.value = '';
            this.updateToneDisplay();
        });

        // Allow Enter key to add custom tone
        customToneInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addCustomToneBtn.click();
            }
        });
    }

    updateToneSelection() {
        // Update checkboxes based on selected tones
        const toneCheckboxes = document.querySelectorAll('input[name="tones"]');
        toneCheckboxes.forEach(checkbox => {
            checkbox.checked = this.selectedTones.includes(checkbox.value);
        });
        this.updateToneDisplay();
    }

    updateToneDisplay() {
        const tonesList = document.getElementById('tonesList');
        const selectedTonesDiv = document.getElementById('selectedTones');
        
        if (this.selectedTones.length === 0) {
            selectedTonesDiv.style.display = 'none';
            return;
        }

        selectedTonesDiv.style.display = 'block';
        tonesList.innerHTML = this.selectedTones.map(tone => 
            `<span class="tone-tag">
                ${tone}
                <span class="remove-tone" data-tone="${tone}">×</span>
            </span>`
        ).join('');

        // Add remove functionality
        document.querySelectorAll('.remove-tone').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const toneToRemove = e.target.getAttribute('data-tone');
                this.selectedTones = this.selectedTones.filter(tone => tone !== toneToRemove);
                
                // Uncheck corresponding checkbox if it exists
                const checkbox = document.querySelector(`input[name="tones"][value="${toneToRemove}"]`);
                if (checkbox) checkbox.checked = false;
                
                this.updateToneDisplay();
            });
        });
    }

    showStatus(message, type) {
        const statusElement = document.getElementById('statusMessage');
        
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `status ${type}`;
            statusElement.style.display = 'block';
            
            // Auto-hide success messages after 5 seconds
            if (type === 'success') {
                setTimeout(() => {
                    statusElement.style.display = 'none';
                }, 5000);
            }

            // Scroll to top to show the message
            window.scrollTo(0, 0);
        }
    }
}

// Initialize settings manager when page loads
document.addEventListener('DOMContentLoaded', () => {
    new SettingsManager();
});
