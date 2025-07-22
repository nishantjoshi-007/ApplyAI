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
    // Check input type first
    if (inputType === "email") return "email";
    if (inputType === "tel") return "phone";
    if (inputType === "url") return "portfolio";
    if (inputType === "date") return "startDate";

    // Convert to lowercase for easier matching
    const lowerText = text.toLowerCase();

    // Name fields - more flexible matching
    if (lowerText.includes("name")) {
      if (lowerText.includes("first") || lowerText.includes("given") || lowerText.includes("fname")) {
        return "firstName";
      }
      if (
        lowerText.includes("last") ||
        lowerText.includes("family") ||
        lowerText.includes("surname") ||
        lowerText.includes("lname")
      ) {
        return "lastName";
      }
      // If it just contains 'name' without first/last qualifiers, treat as full name
      return "fullName";
    }

    // Contact information
    if (lowerText.includes("email") || lowerText.includes("e-mail")) return "email";
    if (
      lowerText.includes("phone") ||
      lowerText.includes("telephone") ||
      lowerText.includes("mobile") ||
      lowerText.includes("cell")
    )
      return "phone";
    if (lowerText.includes("linkedin") || lowerText.includes("linked")) return "linkedin";

    // Location fields
    if (lowerText.includes("location") || lowerText.includes("address")) return "location";
    if (lowerText.includes("city") || lowerText.includes("town")) return "city";
    if (lowerText.includes("state") || lowerText.includes("province") || lowerText.includes("region")) return "state";
    if (lowerText.includes("zip") || lowerText.includes("postal") || lowerText.includes("postcode")) return "zipCode";
    if (lowerText.includes("country") || lowerText.includes("nation")) return "country";

    // Work information
    if (lowerText.includes("title") || lowerText.includes("position") || lowerText.includes("role"))
      return "currentTitle";
    if (lowerText.includes("company") || lowerText.includes("employer") || lowerText.includes("organization"))
      return "currentCompany";
    if (lowerText.includes("experience") || lowerText.includes("years")) return "experience";
    if (lowerText.includes("salary") || lowerText.includes("compensation") || lowerText.includes("pay"))
      return "salary";

    // Education
    if (lowerText.includes("university") || lowerText.includes("college") || lowerText.includes("school"))
      return "university";
    if (lowerText.includes("degree") || lowerText.includes("qualification")) return "degree";
    if (lowerText.includes("major") || lowerText.includes("field") || lowerText.includes("specialization"))
      return "major";
    if (lowerText.includes("graduation") && lowerText.includes("year")) return "graduationYear";
    if (lowerText.includes("gpa") || lowerText.includes("grade")) return "gpa";

    // Work authorization and availability
    if (lowerText.includes("authorization") || lowerText.includes("visa") || lowerText.includes("sponsor"))
      return "workAuth";
    if (lowerText.includes("start") && lowerText.includes("date")) return "startDate";
    if (lowerText.includes("relocate") || lowerText.includes("relocation")) return "relocate";
    if (lowerText.includes("remote") || (lowerText.includes("work") && lowerText.includes("home"))) return "remote";

    // Equal Opportunity Information - look for systemfield patterns
    if (lowerText.includes("eeoc_gender") || lowerText.includes("gender") || lowerText.includes("sex"))
      return "gender";
    if (lowerText.includes("eeoc_race") || lowerText.includes("race") || lowerText.includes("ethnicity"))
      return "race";
    if (lowerText.includes("eeoc_veteran") || lowerText.includes("veteran") || lowerText.includes("military"))
      return "veteran";
    if (lowerText.includes("eeoc_disability") || lowerText.includes("disability") || lowerText.includes("disabled"))
      return "disability";

    return "unknown";
  }

  autofillForm(personalDetails) {
    if (!personalDetails) {
      console.warn("No personal details provided for autofill");
      return;
    }

    const inputs = document.querySelectorAll("input, select, textarea");
    let filledCount = 0;
    const processedFields = new Set(); // Track processed fields to avoid duplicates

    inputs.forEach((input) => {
      // Skip if already filled or is password/hidden type
      if (input.value || input.type === "password" || input.type === "hidden" || input.disabled) {
        return;
      }

      const fieldInfo = this.analyzeField(input);
      let value = this.getValueForField(fieldInfo.type, personalDetails);

      // Special handling for name fields - if no specific value found, try name detection
      if (!value && this.isNameField(input) && !processedFields.has("name")) {
        value = this.getNameValue(input, personalDetails);
        if (value) {
          processedFields.add("name");
        }
      }

      // Special handling for location fields
      if (!value && this.isLocationField(input) && !processedFields.has("location")) {
        // Try different location values based on field context
        const context = this.getFieldContext(input).toLowerCase();
        if (context.includes("location") && personalDetails.city) {
          value = `${personalDetails.city}${personalDetails.state ? ", " + personalDetails.state : ""}`;
          processedFields.add("location");
        }
      }

      // For radio buttons and checkboxes, always try to fill them even if no direct value match
      if ((input.type === "radio" || input.type === "checkbox") && !value) {
        // Try EEO fields
        const context = this.getFieldContext(input).toLowerCase();
        if (context.includes("gender") && personalDetails.gender) {
          value = personalDetails.gender;
        } else if (context.includes("race") && personalDetails.race) {
          value = personalDetails.race;
        } else if (context.includes("veteran") && personalDetails.veteranStatus) {
          value = personalDetails.veteranStatus;
        } else if (context.includes("disability") && personalDetails.disabilityStatus) {
          value = personalDetails.disabilityStatus;
        }
      }

      if (value) {
        console.log(`Filling field: ${fieldInfo.label || input.name || input.id} with value: ${value}`);
        this.fillField(input, value);
        filledCount++;
      }
    });

    // Show notification
    this.showAutofillNotification(filledCount);

    console.log(`Autofilled ${filledCount} fields`);
  }

  isNameField(element) {
    const text = this.getFieldContext(element).toLowerCase();
    // More flexible name field detection - just needs to contain 'name'
    // and NOT contain first/last/given/family/surname qualifiers
    return text.includes("name") && !/first|last|given|family|surname/i.test(text);
  }

  getNameValue(element, personalDetails) {
    const text = this.getFieldContext(element).toLowerCase();

    // If it's clearly a general name field (not first/last specific)
    if (/^name$|full.*name|your.*name|applicant.*name/i.test(text)) {
      const fullName = `${personalDetails.firstName || ""} ${personalDetails.lastName || ""}`.trim();
      if (fullName) {
        return fullName;
      }
    }

    return null;
  }

  getValueForField(fieldType, personalDetails) {
    const mapping = {
      firstName: personalDetails.firstName,
      lastName: personalDetails.lastName,
      fullName: `${personalDetails.firstName || ""} ${personalDetails.lastName || ""}`.trim(),
      email: personalDetails.email,
      phone: personalDetails.phone,
      address: personalDetails.address1,
      location: personalDetails.city
        ? `${personalDetails.city}${personalDetails.state ? ", " + personalDetails.state : ""}`
        : "",
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

      // Equal Opportunity Information
      gender: personalDetails.gender,
      race: personalDetails.race,
      ethnicity: personalDetails.race,
      veteran: personalDetails.veteranStatus,
      veteranStatus: personalDetails.veteranStatus,
      disability: personalDetails.disabilityStatus,
      disabilityStatus: personalDetails.disabilityStatus,
    };

    return mapping[fieldType] || "";
  }

  fillField(element, value) {
    if (!value) return;

    if (element.type === "checkbox") {
      // Handle checkbox based on value
      if (value === "Yes" || value === true) {
        element.checked = true;
      } else if (this.isEEOCheckbox(element, value)) {
        element.checked = true;
      }
    } else if (element.type === "radio") {
      // Handle radio buttons - check if this specific radio button should be selected
      if (this.isEEOCheckbox(element, value)) {
        element.checked = true;
      } else if (value === "Yes" && element.value && element.value.toLowerCase().includes("yes")) {
        element.checked = true;
      } else if (value === "No" && element.value && element.value.toLowerCase().includes("no")) {
        element.checked = true;
      }
    } else if (element.tagName.toLowerCase() === "select") {
      // Find matching option for select dropdowns
      const option = Array.from(element.options).find(
        (opt) =>
          opt.text.toLowerCase().includes(value.toLowerCase()) ||
          opt.value.toLowerCase().includes(value.toLowerCase())
      );
      if (option) {
        element.value = option.value;
      }
    } else {
      // Handle regular input fields
      element.value = value;

      // Special handling for location fields with autocomplete/suggestions
      if (this.isLocationField(element)) {
        this.handleLocationAutocomplete(element, value);
      }
    }

    // Trigger change events
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));

    // For some modern frameworks
    element.dispatchEvent(new Event("keyup", { bubbles: true }));
  }

  isEEOCheckbox(element, value) {
    const context = this.getFieldContext(element).toLowerCase();
    const elementValue = element.value ? element.value.toLowerCase() : "";
    const parentText = element.parentElement ? element.parentElement.textContent.toLowerCase() : "";
    const elementId = element.id ? element.id.toLowerCase() : "";
    const elementName = element.name ? element.name.toLowerCase() : "";

    // Combine all text for analysis
    const allText = `${context} ${elementValue} ${parentText} ${elementId} ${elementName}`.toLowerCase();

    // If the stored value is empty or "prefer not to answer", don't check any boxes
    if (!value || value === "" || /prefer.*not|decline/i.test(value)) {
      return false;
    }

    // Check if this is an EEO field first
    const isEEOField =
      allText.includes("eeoc") ||
      allText.includes("systemfield") ||
      allText.includes("gender") ||
      allText.includes("race") ||
      allText.includes("veteran") ||
      allText.includes("disability");

    if (!isEEOField) return false;

    // Check if this checkbox/radio matches the user's EEO selection
    const userValue = value.toLowerCase();

    // Gender matching
    if (allText.includes("gender") || allText.includes("sex")) {
      if (userValue === "male" && allText.includes("male") && !allText.includes("female")) return true;
      if (userValue === "female" && allText.includes("female")) return true;
      if (userValue === "non_binary" && (allText.includes("non") || allText.includes("other"))) return true;
      if ((userValue === "prefer_not_to_answer" || userValue === "") && allText.includes("decline")) return true;
    }

    // Race/Ethnicity matching
    if (allText.includes("race") || allText.includes("ethnicity")) {
      if (userValue === "white" && allText.includes("white") && !allText.includes("hispanic")) return true;
      if (userValue === "black_african_american" && (allText.includes("black") || allText.includes("african")))
        return true;
      if (userValue === "hispanic_latino" && (allText.includes("hispanic") || allText.includes("latino")))
        return true;
      if (userValue === "asian" && allText.includes("asian")) return true;
      if (
        userValue === "native_american" &&
        (allText.includes("native") || allText.includes("indian") || allText.includes("alaska"))
      )
        return true;
      if (userValue === "native_hawaiian_pacific" && (allText.includes("hawaiian") || allText.includes("pacific")))
        return true;
      if (userValue === "two_or_more" && (allText.includes("two") || allText.includes("multiple"))) return true;
      if ((userValue === "prefer_not_to_answer" || userValue === "") && allText.includes("decline")) return true;
    }

    // Veteran status matching
    if (allText.includes("veteran") || allText.includes("military")) {
      if (userValue === "not_veteran" && (allText.includes("not") || allText.includes("no"))) return true;
      if (userValue === "disabled_veteran" && allText.includes("disabled")) return true;
      if (userValue === "recently_separated" && allText.includes("recently")) return true;
      if (
        userValue === "active_duty_wartime" &&
        (allText.includes("active") || allText.includes("wartime") || allText.includes("campaign"))
      )
        return true;
      if (
        userValue === "armed_forces_service" &&
        (allText.includes("armed") || allText.includes("service") || allText.includes("medal"))
      )
        return true;
      if (userValue === "protected_veteran" && allText.includes("protected")) return true;
      if ((userValue === "prefer_not_to_answer" || userValue === "") && allText.includes("decline")) return true;
    }

    // Disability status matching
    if (allText.includes("disability") || allText.includes("disabled")) {
      if (
        userValue === "no_disability" &&
        (allText.includes("no") || allText.includes("don't") || allText.includes("not"))
      )
        return true;
      if (userValue === "has_disability" && (allText.includes("yes") || allText.includes("have"))) return true;
      if (
        (userValue === "prefer_not_to_answer" || userValue === "") &&
        (allText.includes("decline") || (allText.includes("not") && allText.includes("answer")))
      )
        return true;
    }

    return false;
  }

  isLocationField(element) {
    const text = this.getFieldContext(element).toLowerCase();
    // More flexible location field detection
    return (
      text.includes("location") ||
      text.includes("city") ||
      text.includes("address") ||
      text.includes("state") ||
      text.includes("province") ||
      text.includes("country")
    );
  }

  getFieldContext(element) {
    const label = this.getFieldLabel(element);
    const name = element.name || element.id || "";
    const placeholder = element.placeholder || "";
    return `${label} ${name} ${placeholder}`;
  }

  handleLocationAutocomplete(element, value) {
    // Fill the input first
    element.value = value;

    // Trigger input events to activate autocomplete
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("keyup", { bubbles: true }));
    element.focus();

    // Wait for autocomplete suggestions to appear
    setTimeout(() => {
      // Look for autocomplete dropdown/suggestions
      const suggestions = this.findAutocompleteOptions(element, value);
      if (suggestions.length > 0) {
        // Click on the first matching suggestion
        suggestions[0].click();
      } else {
        // If no suggestions found, try pressing Enter or Tab to accept the value
        element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        element.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      }
    }, 1000); // Increased timeout for slower autocomplete systems
  }

  findAutocompleteOptions(element, value) {
    const suggestions = [];

    // Common autocomplete selectors
    const autocompleteSelectors = [
      ".autocomplete-suggestions",
      ".suggestions",
      ".dropdown-menu",
      ".typeahead",
      '[role="listbox"]',
      '[role="option"]',
      ".pac-container", // Google Places
      ".location-suggestions",
      ".city-suggestions",
    ];

    for (const selector of autocompleteSelectors) {
      const container = document.querySelector(selector);
      if (container && container.style.display !== "none") {
        const options = container.querySelectorAll('li, div[role="option"], .suggestion-item, .autocomplete-option');

        options.forEach((option) => {
          const optionText = option.textContent.trim().toLowerCase();
          const searchValue = value.toLowerCase();

          // Check if option matches our value
          if (optionText.includes(searchValue) || searchValue.includes(optionText)) {
            suggestions.push(option);
          }
        });
      }
    }

    return suggestions;
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
