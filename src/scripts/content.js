// Content script for job description extraction
class JobDescriptionExtractor {
  constructor() {
    this.init();
  }

  init() {
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "extractJobDescription") {
        const jobDescription = this.extractJobDescription();
        sendResponse({ jobDescription: jobDescription });
      } else if (request.action === "autofillForm") {
        this.autofillForm(request.personalDetails);
        sendResponse({ success: true });
      } else if (request.action === "scanForForms") {
        const formInfo = this.scanForForms();
        sendResponse({ formInfo: formInfo });
      }
    });
  }

  extractJobDescription() {
    try {
      // Strategy 1: Try specific job description selectors
      const specificSelectors = [
        ".job-description",
        ".job-details",
        '[data-testid="job-description"]',
        ".description",
        ".job-summary",
        ".posting-description",
        ".job-posting-details",
        ".job-content",
        ".position-description",
        ".jobdescription",
        ".job_description",
        "#jobDescriptionText",
        ".jobsearch-jobDescriptionText",
        ".jobs-description",
        ".job-view-description",
      ];

      let jobText = "";

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
        "responsibilities",
        "requirements",
        "qualifications",
        "experience",
        "skills",
        "duties",
        "position",
        "role",
        "job",
        "career",
        "candidate",
        "looking for",
        "seeking",
        "required",
        "preferred",
      ];

      const textElements = document.querySelectorAll("div, section, article, p");
      let bestMatch = "";
      let bestScore = 0;

      textElements.forEach((el) => {
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
      let longestText = "";
      textElements.forEach((el) => {
        const text = this.cleanText(el.innerText);
        if (text.length > longestText.length && text.length > 300 && text.length < 8000) {
          // Quick check for job-related content
          const lowerText = text.toLowerCase();
          if (jobKeywords.some((keyword) => lowerText.includes(keyword))) {
            longestText = text;
          }
        }
      });

      return longestText || "Could not extract job description from this page";
    } catch (error) {
      console.error("Error extracting job description:", error);
      return "Error extracting job description";
    }
  }

  extractSiteSpecific() {
    const hostname = window.location.hostname.toLowerCase();

    // LinkedIn
    if (hostname.includes("linkedin.com")) {
      const linkedinSelectors = [
        ".jobs-description-content__text",
        ".jobs-box__html-content",
        ".job-view-description",
        ".jobs-description",
      ];

      for (const selector of linkedinSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          return this.cleanText(element.innerText);
        }
      }
    }

    // Indeed
    if (hostname.includes("indeed.com")) {
      const indeedSelectors = [
        ".jobsearch-jobDescriptionText",
        "#jobDescriptionText",
        ".jobsearch-JobComponent-description",
      ];

      for (const selector of indeedSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          return this.cleanText(element.innerText);
        }
      }
    }

    // Glassdoor
    if (hostname.includes("glassdoor.com")) {
      const glassdoorSelectors = ['[data-test="jobDescription"]', ".jobDescriptionContent", ".desc"];

      for (const selector of glassdoorSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          return this.cleanText(element.innerText);
        }
      }
    }

    // AngelList/Wellfound
    if (hostname.includes("angel.co") || hostname.includes("wellfound.com")) {
      const angelSelectors = ['[data-test-id="JobDescription"]', ".job-description", ".startup-jobs-description"];

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

    keywords.forEach((keyword) => {
      const regex = new RegExp(`\\b${keyword}\\b`, "gi");
      const matches = text.match(regex);
      if (matches) {
        score += matches.length;
      }
    });

    // Bonus points for typical job description structure
    if (lowerText.includes("responsibilities") && lowerText.includes("requirements")) {
      score += 5;
    }

    if (lowerText.includes("qualifications") || lowerText.includes("experience")) {
      score += 3;
    }

    return score;
  }

  cleanText(text) {
    return text
      .replace(/\s+/g, " ") // Replace multiple whitespace with single space
      .replace(/\n\s*\n/g, "\n\n") // Clean up line breaks
      .trim();
  }

  // Autofill functionality
  scanForForms() {
    const forms = document.querySelectorAll("form");
    const inputs = document.querySelectorAll("input, select, textarea");

    const formInfo = {
      formsFound: forms.length,
      inputsFound: inputs.length,
      detectedFields: [],
    };

    inputs.forEach((input) => {
      const fieldInfo = this.analyzeField(input);
      if (fieldInfo.type !== "unknown") {
        formInfo.detectedFields.push(fieldInfo);
      }
    });

    return formInfo;
  }

  analyzeField(element) {
    const label = this.getFieldLabel(element);
    const name = element.name || element.id || "";
    const type = element.type || element.tagName.toLowerCase();
    const placeholder = element.placeholder || "";

    // Combine all text for analysis
    const allText = `${label} ${name} ${placeholder}`.toLowerCase();

    return {
      element: element.tagName.toLowerCase(),
      type: this.detectFieldType(allText, type),
      name: name,
      label: label,
      placeholder: placeholder,
      required: element.required || false,
    };
  }

  getFieldLabel(element) {
    // Try to find associated label
    const id = element.id;
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (label) return label.textContent.trim();
    }

    // Look for parent label
    const parentLabel = element.closest("label");
    if (parentLabel) return parentLabel.textContent.trim();

    // Look for nearby text
    const parent = element.parentElement;
    if (parent) {
      const texts = parent.querySelectorAll("span, div, p, label");
      for (const text of texts) {
        if (text !== element && text.textContent.trim()) {
          return text.textContent.trim();
        }
      }
    }

    return "";
  }

  detectFieldType(text, inputType) {
    const patterns = {
      firstName: /first.*name|given.*name|fname/i,
      lastName: /last.*name|family.*name|surname|lname/i,
      fullName: /^name$|full.*name|your.*name/i,
      email: /email|e-mail/i,
      phone: /phone|telephone|mobile|cell/i,
      address: /address|street/i,
      city: /city|town/i,
      state: /state|province|region/i,
      zipCode: /zip|postal.*code|postcode/i,
      country: /country|nation/i,
      currentTitle: /current.*title|job.*title|position|role/i,
      currentCompany: /current.*company|employer|organization/i,
      experience: /experience|years/i,
      salary: /salary|compensation|pay|wage/i,
      linkedin: /linkedin|linked.*in/i,
      portfolio: /portfolio|website|url|link/i,
      university: /university|college|school|education/i,
      degree: /degree|qualification|certification/i,
      major: /major|field.*study|specialization/i,
      graduationYear: /graduation.*year|grad.*year|year.*graduation/i,
      gpa: /gpa|grade.*point|grades/i,
      workAuth: /work.*authorization|visa|citizen|sponsor/i,
      startDate: /start.*date|available.*date|begin.*date/i,
      relocate: /relocate|willing.*move|relocation/i,
      remote: /remote|work.*home|telecommute/i,
    };

    // Check input type first
    if (inputType === "email") return "email";
    if (inputType === "tel") return "phone";
    if (inputType === "url") return "portfolio";
    if (inputType === "date") return "startDate";

    // Check patterns
    for (const [fieldType, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) {
        return fieldType;
      }
    }

    return "unknown";
  }

  autofillForm(personalDetails) {
    if (!personalDetails) {
      console.warn("No personal details provided for autofill");
      return;
    }

    const inputs = document.querySelectorAll("input, select, textarea");
    let filledCount = 0;

    inputs.forEach((input) => {
      // Skip if already filled or is password/hidden type
      if (input.value || input.type === "password" || input.type === "hidden" || input.disabled) {
        return;
      }

      const fieldInfo = this.analyzeField(input);
      const value = this.getValueForField(fieldInfo.type, personalDetails);

      if (value) {
        this.fillField(input, value);
        filledCount++;
      }
    });

    // Show notification
    this.showAutofillNotification(filledCount);

    console.log(`Autofilled ${filledCount} fields`);
  }

  getValueForField(fieldType, personalDetails) {
    const mapping = {
      firstName: personalDetails.firstName,
      lastName: personalDetails.lastName,
      fullName: `${personalDetails.firstName} ${personalDetails.lastName}`.trim(),
      email: personalDetails.email,
      phone: personalDetails.phone,
      address: personalDetails.address1,
      city: personalDetails.city,
      state: personalDetails.state,
      zipCode: personalDetails.zipCode,
      country: personalDetails.country,
      currentTitle: personalDetails.currentTitle,
      currentCompany: personalDetails.currentCompany,
      experience: personalDetails.totalExperience,
      salary: personalDetails.desiredSalary,
      linkedin: personalDetails.linkedinUrl,
      portfolio: personalDetails.portfolioUrl,
      university: personalDetails.university,
      degree: personalDetails.degree,
      major: personalDetails.major,
      graduationYear: personalDetails.graduationYear,
      gpa: personalDetails.gpa,
      workAuth: personalDetails.workAuthorization,
      startDate: personalDetails.availableStartDate,
      relocate: personalDetails.willingToRelocate ? "Yes" : "No",
      remote: personalDetails.remoteWork ? "Yes" : "No",
    };

    return mapping[fieldType] || "";
  }

  fillField(element, value) {
    if (element.type === "checkbox" || element.type === "radio") {
      // Handle checkbox/radio based on value
      if (value === "Yes" || value === true) {
        element.checked = true;
      }
    } else if (element.tagName.toLowerCase() === "select") {
      // Find matching option
      const option = Array.from(element.options).find(
        (opt) =>
          opt.text.toLowerCase().includes(value.toLowerCase()) ||
          opt.value.toLowerCase().includes(value.toLowerCase())
      );
      if (option) {
        element.value = option.value;
      }
    } else {
      element.value = value;
    }

    // Trigger change events
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  showAutofillNotification(count) {
    // Create and show a temporary notification
    const notification = document.createElement("div");
    notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #007bff;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            font-size: 14px;
            font-weight: 500;
            max-width: 300px;
        `;
    notification.textContent = `🤖 ApplyAI: Successfully filled ${count} fields`;

    document.body.appendChild(notification);

    // Remove after 4 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 4000);
  }
}

// Initialize the content script
new JobDescriptionExtractor();
