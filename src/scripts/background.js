// Background script for Chrome extension

// Handle installation
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        handleInstall();
    }
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    handleMessage(request, sender, sendResponse);
    return true; // Keep message channel open for async responses
});

// Setup context menu on startup
setupContextMenu();

async function handleInstall() {
    try {
        // Open options page on first install
        chrome.runtime.openOptionsPage();
        
        // Set default settings if none exist
        const result = await chrome.storage.local.get(['firstRun']);
        if (!result.firstRun) {
            await chrome.storage.local.set({
                firstRun: false,
                installDate: new Date().toISOString()
            });
        }
    } catch (error) {
        console.error('Error handling installation:', error);
    }
}

function handleMessage(request, sender, sendResponse) {
    switch (request.action) {
        case 'getJobDescription':
            getJobDescription(sender.tab.id)
                .then(response => sendResponse(response))
                .catch(error => sendResponse({error: error.message}));
            break;
            
        case 'generateCoverLetter':
            generateCoverLetter(request.data)
                .then(response => sendResponse(response))
                .catch(error => sendResponse({error: error.message}));
            break;
            
        case 'openOptionsPage':
            chrome.runtime.openOptionsPage();
            sendResponse({success: true});
            break;
            
        default:
            sendResponse({error: 'Unknown action'});
    }
}

async function getJobDescription(tabId) {
    try {
        const result = await chrome.scripting.executeScript({
            target: {tabId: tabId},
            function: () => {
                // This function runs in the context of the tab
                const extractor = new JobDescriptionExtractor();
                return extractor.extractJobDescription();
            }
        });
        
        return {
            success: true,
            jobDescription: result[0]?.result || 'Could not extract job description'
        };
    } catch (error) {
        console.error('Error getting job description:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

async function generateCoverLetter(data) {
    try {
        const {jobDescription} = data;
        const settings = await chrome.storage.local.get(['resume', 'coverLetterTemplate', 'geminiApiKey']);
        
        if (!settings.resume || !settings.coverLetterTemplate || !settings.geminiApiKey) {
            throw new Error('Missing required settings. Please configure your resume, template, and API key.');
        }

        const coverLetter = await callGeminiAPI(
            jobDescription,
            settings.resume,
            settings.coverLetterTemplate,
            settings.geminiApiKey
        );

        return {
            success: true,
            coverLetter: coverLetter
        };
    } catch (error) {
        console.error('Error generating cover letter:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

async function callGeminiAPI(jobDescription, resume, template, apiKey) {
    const prompt = `
You are a professional cover letter writer. Generate a personalized cover letter based on the following:

RESUME:
${resume}

COVER LETTER TEMPLATE:
${template}

JOB DESCRIPTION:
${jobDescription}

Instructions:
1. Use the provided resume information to highlight relevant experience
2. Follow the structure and tone of the cover letter template
3. Customize the content to match the specific job description
4. Keep it professional and concise (3-4 paragraphs)
5. Make it compelling and show enthusiasm for the role
6. Include specific examples from the resume that match job requirements
7. Replace placeholders like [Company Name], [Position] with appropriate information from the job description

Generate only the cover letter content, no additional commentary.
    `.trim();

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
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

function setupContextMenu() {
    // Optional: Add context menu for future enhancements
    // Check if contextMenus API is available
    if (chrome.contextMenus) {
        try {
            chrome.contextMenus.removeAll(() => {
                if (chrome.runtime.lastError) {
                    console.log('Context menu setup skipped:', chrome.runtime.lastError);
                    return;
                }
                
                chrome.contextMenus.create({
                    id: 'generateCoverLetter',
                    title: 'Generate Cover Letter',
                    contexts: ['selection', 'page'],
                    documentUrlPatterns: [
                        '*://*.linkedin.com/*',
                        '*://*.indeed.com/*',
                        '*://*.glassdoor.com/*',
                        '*://*.angel.co/*',
                        '*://*.wellfound.com/*'
                    ]
                });
            });

            chrome.contextMenus.onClicked.addListener((info, tab) => {
                if (info.menuItemId === 'generateCoverLetter') {
                    // Open popup or trigger generation
                    chrome.action.openPopup();
                }
            });
        } catch (error) {
            console.log('Context menu setup failed:', error);
        }
    }
}
