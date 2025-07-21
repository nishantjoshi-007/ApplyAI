// Content script for job description extraction
class JobDescriptionExtractor {
    constructor() {
        this.init();
    }

    init() {
        // Listen for messages from popup
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'extractJobDescription') {
                const jobDescription = this.extractJobDescription();
                sendResponse({jobDescription: jobDescription});
            }
        });
    }

    extractJobDescription() {
        try {
            // Strategy 1: Try specific job description selectors
            const specificSelectors = [
                '.job-description',
                '.job-details',
                '[data-testid="job-description"]',
                '.description',
                '.job-summary',
                '.posting-description',
                '.job-posting-details',
                '.job-content',
                '.position-description',
                '.jobdescription',
                '.job_description',
                '#jobDescriptionText',
                '.jobsearch-jobDescriptionText',
                '.jobs-description',
                '.job-view-description'
            ];

            let jobText = '';

            for (const selector of specificSelectors) {
                const element = document.querySelector(selector);
                if (element) {
                    jobText = this.cleanText(element.innerText);
                    if (jobText.length > 100) {
                        return jobText;
                    }
                }
            }

            // Strategy 2: Site-specific extraction
            const siteSpecificText = this.extractSiteSpecific();
            if (siteSpecificText) {
                return siteSpecificText;
            }

            // Strategy 3: Look for elements containing job-related keywords
            const jobKeywords = [
                'responsibilities', 'requirements', 'qualifications', 'experience',
                'skills', 'duties', 'position', 'role', 'job', 'career',
                'candidate', 'looking for', 'seeking', 'required', 'preferred'
            ];

            const textElements = document.querySelectorAll('div, section, article, p');
            let bestMatch = '';
            let bestScore = 0;

            textElements.forEach(el => {
                const text = this.cleanText(el.innerText);
                if (text.length > 200 && text.length < 10000) {
                    const score = this.calculateJobDescriptionScore(text, jobKeywords);
                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = text;
                    }
                }
            });

            if (bestMatch && bestScore > 3) {
                return bestMatch;
            }

            // Strategy 4: Fallback - get the longest meaningful text
            let longestText = '';
            textElements.forEach(el => {
                const text = this.cleanText(el.innerText);
                if (text.length > longestText.length && text.length > 300 && text.length < 8000) {
                    // Quick check for job-related content
                    const lowerText = text.toLowerCase();
                    if (jobKeywords.some(keyword => lowerText.includes(keyword))) {
                        longestText = text;
                    }
                }
            });

            return longestText || 'Could not extract job description from this page';

        } catch (error) {
            console.error('Error extracting job description:', error);
            return 'Error extracting job description';
        }
    }

    extractSiteSpecific() {
        const hostname = window.location.hostname.toLowerCase();
        
        // LinkedIn
        if (hostname.includes('linkedin.com')) {
            const linkedinSelectors = [
                '.jobs-description-content__text',
                '.jobs-box__html-content',
                '.job-view-description',
                '.jobs-description'
            ];
            
            for (const selector of linkedinSelectors) {
                const element = document.querySelector(selector);
                if (element) {
                    return this.cleanText(element.innerText);
                }
            }
        }
        
        // Indeed
        if (hostname.includes('indeed.com')) {
            const indeedSelectors = [
                '.jobsearch-jobDescriptionText',
                '#jobDescriptionText',
                '.jobsearch-JobComponent-description'
            ];
            
            for (const selector of indeedSelectors) {
                const element = document.querySelector(selector);
                if (element) {
                    return this.cleanText(element.innerText);
                }
            }
        }

        // Glassdoor
        if (hostname.includes('glassdoor.com')) {
            const glassdoorSelectors = [
                '[data-test="jobDescription"]',
                '.jobDescriptionContent',
                '.desc'
            ];
            
            for (const selector of glassdoorSelectors) {
                const element = document.querySelector(selector);
                if (element) {
                    return this.cleanText(element.innerText);
                }
            }
        }

        // AngelList/Wellfound
        if (hostname.includes('angel.co') || hostname.includes('wellfound.com')) {
            const angelSelectors = [
                '[data-test-id="JobDescription"]',
                '.job-description',
                '.startup-jobs-description'
            ];
            
            for (const selector of angelSelectors) {
                const element = document.querySelector(selector);
                if (element) {
                    return this.cleanText(element.innerText);
                }
            }
        }

        return null;
    }

    calculateJobDescriptionScore(text, keywords) {
        const lowerText = text.toLowerCase();
        let score = 0;
        
        keywords.forEach(keyword => {
            const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
            const matches = text.match(regex);
            if (matches) {
                score += matches.length;
            }
        });

        // Bonus points for typical job description structure
        if (lowerText.includes('responsibilities') && lowerText.includes('requirements')) {
            score += 5;
        }
        
        if (lowerText.includes('qualifications') || lowerText.includes('experience')) {
            score += 3;
        }

        return score;
    }

    cleanText(text) {
        return text
            .replace(/\s+/g, ' ')  // Replace multiple whitespace with single space
            .replace(/\n\s*\n/g, '\n\n')  // Clean up line breaks
            .trim();
    }
}

// Initialize the content script
new JobDescriptionExtractor();
