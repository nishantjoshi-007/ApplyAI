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

    console.log("🤖 ApplyAI: Starting intelligent form analysis...");

    // First, analyze the entire form to understand all questions
    this.analyzeFormQuestions(personalDetails)
      .then((analysisResult) => {
        console.log("Form analysis complete:", analysisResult);
        this.executeAutofill(personalDetails, analysisResult);
      })
      .catch((error) => {
        console.error("Error in form analysis, falling back to basic autofill:", error);
        this.executeBasicAutofill(personalDetails);
      });
  }

  async analyzeFormQuestions(personalDetails) {
    const inputs = document.querySelectorAll("input, select, textarea");
    const formQuestions = [];
    const directFillable = [];
    const needsAI = [];

    inputs.forEach((input) => {
      // Skip already filled, password, hidden, or disabled fields
      if (input.value || input.type === "password" || input.type === "hidden" || input.disabled) {
        return;
      }

      const fieldInfo = this.analyzeField(input);
      const questionText = this.extractQuestionText(input);
      const directValue = this.getValueForField(fieldInfo.type, personalDetails);

      const questionData = {
        element: input,
        fieldInfo: fieldInfo,
        questionText: questionText,
        canDirectFill: !!directValue,
        directValue: directValue,
        needsAI: false,
      };

      // Check if this is a special field that needs name handling
      if (!directValue && this.isNameField(input)) {
        const nameValue = this.getNameValue(input, personalDetails);
        if (nameValue) {
          questionData.canDirectFill = true;
          questionData.directValue = nameValue;
        }
      }

      // Check if this needs AI-powered response
      if (!questionData.canDirectFill && questionText && this.isOpenEndedQuestion(questionText, input)) {
        questionData.needsAI = true;
        needsAI.push(questionData);
      } else if (questionData.canDirectFill) {
        directFillable.push(questionData);
      }

      formQuestions.push(questionData);
    });

    // Generate AI responses for questions that need them
    let aiResponses = {};
    if (needsAI.length > 0) {
      console.log(`🧠 Generating AI responses for ${needsAI.length} questions...`);
      aiResponses = await this.generateAIResponses(needsAI, personalDetails);
    }

    return {
      formQuestions,
      directFillable,
      needsAI,
      aiResponses,
    };
  }

  extractQuestionText(element) {
    // Get the full question context including labels, descriptions, and nearby text
    const label = this.getFieldLabel(element);
    const placeholder = element.placeholder || "";
    const name = element.name || element.id || "";

    // Look for question descriptions or help text
    let description = "";
    const parent =
      element.closest(".fieldEntry, .field-entry, .form-group, .question, .field-container") || element.parentElement;

    if (parent) {
      // Look for description elements
      const descriptionElements = parent.querySelectorAll(
        '.description, .help-text, .field-description, .question-description, [class*="description"]'
      );
      descriptionElements.forEach((desc) => {
        if (desc.textContent.trim()) {
          description += " " + desc.textContent.trim();
        }
      });

      // Look for any additional context in paragraphs or divs
      const contextElements = parent.querySelectorAll("p, div");
      contextElements.forEach((ctx) => {
        const text = ctx.textContent.trim();
        if (text && text.length > 20 && text.length < 500 && !text.includes(label)) {
          description += " " + text;
        }
      });
    }

    const fullQuestion = `${label} ${description} ${placeholder}`.trim();
    return fullQuestion || name;
  }

  isOpenEndedQuestion(questionText, element) {
    const text = questionText.toLowerCase();
    const tagName = element.tagName.toLowerCase();

    // Textarea fields are usually open-ended
    if (tagName === "textarea") return true;

    // Text inputs with certain patterns
    if (
      element.type === "text" &&
      (text.includes("why") ||
        text.includes("how") ||
        text.includes("what") ||
        text.includes("describe") ||
        text.includes("explain") ||
        text.includes("tell us") ||
        text.includes("share") ||
        text.includes("motivation") ||
        text.includes("reason") ||
        text.includes("experience") ||
        text.includes("background") ||
        text.includes("interest") ||
        text.includes("passion") ||
        text.includes("goal") ||
        text.includes("strength") ||
        text.includes("weakness") ||
        text.includes("challenge") ||
        text.includes("additional") ||
        text.includes("other") ||
        text.includes("anything else") ||
        text.includes("cover letter") ||
        text.includes("summary") ||
        text.includes("bio") ||
        text.includes("about yourself") ||
        text.includes("why should we") ||
        text.includes("what makes you") ||
        (text.includes("percentage") && text.includes("time"))) // like "What percentage of time do you enjoy coding?"
    ) {
      return true;
    }

    return false;
  }

  async generateAIResponses(needsAIQuestions, personalDetails) {
    try {
      // Prepare the context for AI
      const userProfile = this.buildUserProfileContext(personalDetails);
      const questions = needsAIQuestions.map((q) => ({
        question: q.questionText,
        fieldType: q.fieldInfo.type,
        isTextarea: q.element.tagName.toLowerCase() === "textarea",
        maxLength: q.element.maxLength || (q.element.tagName.toLowerCase() === "textarea" ? 500 : 100),
      }));

      const prompt = this.buildAIPrompt(userProfile, questions);

      // Get AI response from background script (which handles the Gemini API call)
      const response = await this.callAIService(prompt);

      if (response && response.responses) {
        console.log("✅ AI responses generated successfully");
        return response.responses;
      } else {
        console.warn("AI service returned no responses");
        return {};
      }
    } catch (error) {
      console.error("Error generating AI responses:", error);
      return {};
    }
  }

  buildUserProfileContext(personalDetails) {
    const profile = {
      name: `${personalDetails.firstName || ""} ${personalDetails.lastName || ""}`.trim(),
      email: personalDetails.email,
      phone: personalDetails.phone,
      location: personalDetails.city
        ? `${personalDetails.city}${personalDetails.state ? ", " + personalDetails.state : ""}`
        : "",
      currentTitle: personalDetails.currentTitle,
      currentCompany: personalDetails.currentCompany,
      totalExperience: personalDetails.totalExperience,
      university: personalDetails.university,
      degree: personalDetails.degree,
      major: personalDetails.major,
      graduationYear: personalDetails.graduationYear,
      skills: personalDetails.skills || [],
      linkedin: personalDetails.linkedinUrl,
      portfolio: personalDetails.portfolioUrl,
    };

    // Filter out empty values
    return Object.fromEntries(Object.entries(profile).filter(([_, v]) => v && v !== ""));
  }

  buildAIPrompt(userProfile, questions) {
    return {
      action: "generateJobApplicationResponses",
      userProfile: userProfile,
      questions: questions,
      instructions:
        "Generate professional, concise, and personalized responses for these job application questions based on the user's profile. Each response should be tailored to the specific question and sound natural and engaging.",
    };
  }

  async callAIService(prompt) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(prompt, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  executeAutofill(personalDetails, analysisResult) {
    let filledCount = 0;
    const processedFields = new Set();

    // First, fill all direct mappable fields
    analysisResult.directFillable.forEach((questionData) => {
      const { element, directValue, fieldInfo } = questionData;

      if (directValue && !processedFields.has(element)) {
        console.log(`Direct fill: ${fieldInfo.label || element.name || element.id} = ${directValue}`);
        this.fillField(element, directValue);
        processedFields.add(element);
        filledCount++;
      }
    });

    // Then, fill AI-generated responses
    analysisResult.needsAI.forEach((questionData) => {
      const { element, questionText, fieldInfo } = questionData;
      const aiResponse = analysisResult.aiResponses[questionText];

      if (aiResponse && !processedFields.has(element)) {
        console.log(`AI fill: ${fieldInfo.label || element.name || element.id} = ${aiResponse.substring(0, 50)}...`);
        this.fillField(element, aiResponse);
        processedFields.add(element);
        filledCount++;
      }
    });

    // Handle any remaining special cases
    this.handleSpecialFields(personalDetails, analysisResult.formQuestions, processedFields, filledCount);

    // Show notification
    this.showAutofillNotification(filledCount);
    console.log(`🎉 Smart autofill completed: ${filledCount} fields filled`);
  }

  executeBasicAutofill(personalDetails) {
    console.log("Executing basic autofill as fallback...");
    const inputs = document.querySelectorAll("input, select, textarea");
    let filledCount = 0;
    const processedFields = new Set();

    inputs.forEach((input) => {
      if (input.value || input.type === "password" || input.type === "hidden" || input.disabled) {
        return;
      }

      const fieldInfo = this.analyzeField(input);
      let value = this.getValueForField(fieldInfo.type, personalDetails);

      // Special handling for name fields
      if (!value && this.isNameField(input) && !processedFields.has("name")) {
        value = this.getNameValue(input, personalDetails);
        if (value) {
          processedFields.add("name");
        }
      }

      // Special handling for location fields
      if (!value && this.isLocationField(input) && !processedFields.has("location")) {
        const context = this.getFieldContext(input).toLowerCase();
        if (context.includes("location") && personalDetails.city) {
          value = `${personalDetails.city}${personalDetails.state ? ", " + personalDetails.state : ""}`;
          processedFields.add("location");
        }
      }

      // For radio buttons and checkboxes, try EEO fields
      if ((input.type === "radio" || input.type === "checkbox") && !value) {
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
        this.fillField(input, value);
        filledCount++;
      }
    });

    this.showAutofillNotification(filledCount);
    console.log(`Basic autofilled ${filledCount} fields`);
  }

  handleSpecialFields(personalDetails, allQuestions, processedFields, filledCount) {
    // Handle any fields that weren't processed by direct fill or AI
    allQuestions.forEach((questionData) => {
      const { element, fieldInfo } = questionData;

      if (processedFields.has(element)) return;

      // Try special handling for radio/checkbox EEO fields
      if (element.type === "radio" || element.type === "checkbox") {
        const context = this.getFieldContext(element).toLowerCase();
        let value = null;

        if (context.includes("gender") && personalDetails.gender) {
          value = personalDetails.gender;
        } else if (context.includes("race") && personalDetails.race) {
          value = personalDetails.race;
        } else if (context.includes("veteran") && personalDetails.veteranStatus) {
          value = personalDetails.veteranStatus;
        } else if (context.includes("disability") && personalDetails.disabilityStatus) {
          value = personalDetails.disabilityStatus;
        }

        if (value) {
          this.fillField(element, value);
          processedFields.add(element);
          filledCount++;
        }
      }
    });
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
      } else if (this.shouldSelectRadioOption(element, value)) {
        element.checked = true;
      }
    } else if (element.tagName.toLowerCase() === "select") {
      // Smart dropdown selection - find best matching option
      const selectedOption = this.findBestDropdownOption(element, value);
      if (selectedOption) {
        element.value = selectedOption.value;
        console.log(`Selected dropdown option: "${selectedOption.text}" for value: "${value}"`);
      } else {
        // Fallback to original method
        const option = Array.from(element.options).find(
          (opt) =>
            opt.text.toLowerCase().includes(value.toLowerCase()) ||
            opt.value.toLowerCase().includes(value.toLowerCase())
        );
        if (option) {
          element.value = option.value;
        }
      }
    } else {
      // Handle regular input fields
      element.value = value;

      // Special handling for location fields with autocomplete/suggestions
      if (this.isLocationField(element)) {
        // Clear the value and use smart autocomplete typing
        element.value = "";
        this.typeLocationWithAutocomplete(element, value);
      } else {
        // For non-location fields, just set the value normally
        element.value = value;
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

  findBestDropdownOption(element, value) {
    const options = Array.from(element.options);
    if (options.length === 0) return null;

    const valueLower = value.toLowerCase();
    let bestMatch = null;
    let bestScore = 0;

    options.forEach((option) => {
      const optionText = option.text.toLowerCase();
      const optionValue = option.value.toLowerCase();
      let score = 0;

      // Skip empty or placeholder options
      if (
        !optionText ||
        optionText === "select..." ||
        optionText === "choose..." ||
        optionText === "please select" ||
        option.value === "" ||
        option.value === "0"
      ) {
        return;
      }

      // Exact match gets highest score
      if (optionText === valueLower || optionValue === valueLower) {
        score = 1000;
      }
      // Starts with user value
      else if (optionText.startsWith(valueLower) || optionValue.startsWith(valueLower)) {
        score = 500;
      }
      // Contains user value
      else if (optionText.includes(valueLower) || optionValue.includes(valueLower)) {
        score = 100;
      }
      // User value contains option (for abbreviations like "US" for "United States")
      else if (valueLower.includes(optionText) || valueLower.includes(optionValue)) {
        score = 75;
      }
      // Smart matching for common patterns
      else {
        score = this.calculateDropdownMatchScore(optionText, optionValue, valueLower);
      }

      // Bonus for shorter, more specific options
      if (score > 0) {
        score += Math.max(0, 50 - optionText.length);
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = option;
      }
    });

    return bestMatch;
  }

  calculateDropdownMatchScore(optionText, optionValue, userValue) {
    let score = 0;

    // Experience level matching
    if (userValue.includes("year") || /\d+/.test(userValue)) {
      const userYears = parseInt(userValue.match(/\d+/)?.[0] || "0");

      if (optionText.includes("entry") || optionText.includes("junior") || optionText.includes("0-1")) {
        score = userYears <= 1 ? 80 : 20;
      } else if (optionText.includes("mid") || optionText.includes("2-5") || optionText.includes("3-5")) {
        score = userYears >= 2 && userYears <= 5 ? 80 : 20;
      } else if (optionText.includes("senior") || optionText.includes("5+") || optionText.includes("6+")) {
        score = userYears >= 5 ? 80 : 20;
      } else if (optionText.includes("lead") || optionText.includes("principal") || optionText.includes("10+")) {
        score = userYears >= 8 ? 80 : 20;
      }
    }

    // Education level matching
    if (userValue.includes("bachelor") || userValue.includes("bs") || userValue.includes("ba")) {
      if (optionText.includes("bachelor") || optionText.includes("undergraduate")) score = 80;
    } else if (userValue.includes("master") || userValue.includes("ms") || userValue.includes("ma")) {
      if (optionText.includes("master") || optionText.includes("graduate")) score = 80;
    } else if (userValue.includes("phd") || userValue.includes("doctorate")) {
      if (optionText.includes("phd") || optionText.includes("doctorate")) score = 80;
    }

    // Location matching
    if (userValue.includes(",")) {
      const [city, state] = userValue.split(",").map((s) => s.trim().toLowerCase());
      if (optionText.includes(city) || optionText.includes(state)) score = 60;
    }

    // Salary range matching
    if (userValue.includes("$") || userValue.includes("k")) {
      const userSalary = parseInt(userValue.replace(/[$k,]/g, "")) * (userValue.includes("k") ? 1000 : 1);

      // Extract salary range from option
      const salaryMatch = optionText.match(/(\d+)k?\s*-\s*(\d+)k?/);
      if (salaryMatch) {
        const [, min, max] = salaryMatch;
        const minSalary = parseInt(min) * 1000;
        const maxSalary = parseInt(max) * 1000;
        if (userSalary >= minSalary && userSalary <= maxSalary) score = 80;
      }
    }

    // Boolean-like matching
    if (userValue === "yes" || userValue === "true") {
      if (optionText.includes("yes") || optionText.includes("available") || optionText.includes("willing"))
        score = 80;
    } else if (userValue === "no" || userValue === "false") {
      if (optionText.includes("no") || optionText.includes("not") || optionText.includes("unable")) score = 80;
    }

    return score;
  }

  shouldSelectRadioOption(element, value) {
    const elementValue = element.value ? element.value.toLowerCase() : "";
    const elementLabel = this.getRadioButtonLabel(element).toLowerCase();
    const valueLower = value.toLowerCase();

    // Direct value matching
    if (elementValue === valueLower || elementLabel === valueLower) {
      return true;
    }

    // Yes/No matching
    if (valueLower === "yes" || valueLower === "true") {
      return (
        elementValue.includes("yes") ||
        elementLabel.includes("yes") ||
        elementValue.includes("true") ||
        elementLabel.includes("available") ||
        elementLabel.includes("willing") ||
        elementLabel.includes("can")
      );
    }

    if (valueLower === "no" || valueLower === "false") {
      return (
        elementValue.includes("no") ||
        elementLabel.includes("no") ||
        elementValue.includes("false") ||
        elementLabel.includes("not") ||
        elementLabel.includes("unable") ||
        elementLabel.includes("cannot")
      );
    }

    // Partial matching for complex values
    if (
      elementValue.includes(valueLower) ||
      elementLabel.includes(valueLower) ||
      valueLower.includes(elementValue) ||
      valueLower.includes(elementLabel)
    ) {
      return true;
    }

    return false;
  }

  getRadioButtonLabel(element) {
    // Try to find the label for this specific radio button
    const id = element.id;
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (label) return label.textContent.trim();
    }

    // Look for nearby label text
    const parent = element.parentElement;
    if (parent) {
      // Check if the parent or nearby elements contain label text
      const labelElement = parent.querySelector("label");
      if (labelElement) return labelElement.textContent.trim();

      // Look for text nodes or spans near the radio button
      const textNodes = Array.from(parent.childNodes).filter(
        (node) =>
          (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) ||
          (node.nodeType === Node.ELEMENT_NODE && ["SPAN", "DIV", "P"].includes(node.tagName))
      );

      for (const node of textNodes) {
        const text = node.textContent.trim();
        if (text && text !== element.value) {
          return text;
        }
      }
    }

    return element.value || "";
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
    // Focus the element first
    element.focus();
    element.click();

    // Clear any existing value
    element.value = "";
    element.dispatchEvent(new Event("input", { bubbles: true }));

    // Type the location character by character to trigger autocomplete
    this.typeIntoField(element, value).then(() => {
      // Wait a bit for autocomplete suggestions to populate
      setTimeout(() => {
        const bestMatch = this.findBestLocationMatch(element, value);
        if (bestMatch) {
          // Click on the best matching suggestion
          bestMatch.click();
          console.log(`Selected location suggestion: ${bestMatch.textContent.trim()}`);
        } else {
          // If no dropdown suggestion found, try keyboard navigation
          this.tryKeyboardSelection(element, value);
        }
      }, 800);
    });
  }

  async typeIntoField(element, text) {
    // Type character by character with small delays
    for (let i = 0; i < text.length; i++) {
      element.value = text.substring(0, i + 1);

      // Trigger events after each character
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("keyup", { bubbles: true }));

      // Small delay between characters to mimic human typing
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Final events after complete typing
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
    element.focus(); // Refocus to ensure dropdown stays open
  }

  findBestLocationMatch(element, searchValue) {
    const suggestions = this.findAutocompleteOptions(element, searchValue);

    if (suggestions.length === 0) return null;

    const searchLower = searchValue.toLowerCase();
    let bestMatch = null;
    let bestScore = 0;

    suggestions.forEach((suggestion) => {
      const suggestionText = suggestion.textContent.trim().toLowerCase();
      let score = 0;

      // Exact match gets highest score
      if (suggestionText === searchLower) {
        score = 1000;
      }
      // Starts with search term gets high score
      else if (suggestionText.startsWith(searchLower)) {
        score = 500;
      }
      // Contains search term gets medium score
      else if (suggestionText.includes(searchLower)) {
        score = 100;
      }
      // Check if search term contains suggestion (for partial matches)
      else if (searchLower.includes(suggestionText)) {
        score = 50;
      }

      // Bonus points for shorter suggestions (more specific)
      score += Math.max(0, 100 - suggestionText.length);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = suggestion;
      }
    });

    return bestMatch;
  }

  tryKeyboardSelection(element, value) {
    // Try using keyboard navigation if dropdown suggestions didn't work
    element.focus();

    // Try arrow down to select first option then Enter
    setTimeout(() => {
      element.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      setTimeout(() => {
        element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      }, 200);
    }, 100);
  }

  findAutocompleteOptions(element, value) {
    const suggestions = [];

    // Common autocomplete selectors - expanded list
    const autocompleteSelectors = [
      ".autocomplete-suggestions",
      ".autocomplete-dropdown",
      ".suggestions",
      ".dropdown-menu",
      ".dropdown-content",
      ".typeahead",
      '[role="listbox"]',
      '[role="option"]',
      '[role="menu"]',
      '[role="menuitem"]',
      ".pac-container", // Google Places
      ".location-suggestions",
      ".city-suggestions",
      ".search-suggestions",
      ".suggestion-list",
      ".dropdown-list",
      ".results-dropdown",
      ".autocomplete-results",
      ".location-dropdown",
      ".geo-suggestions",
      // Common class patterns
      '[class*="suggestion"]',
      '[class*="dropdown"]',
      '[class*="autocomplete"]',
      '[class*="typeahead"]',
      '[class*="location"]',
      // ID patterns
      '[id*="suggestion"]',
      '[id*="dropdown"]',
      '[id*="autocomplete"]',
    ];

    // Also check for dropdowns that might be siblings or related to the input
    const inputParent = element.parentElement;
    if (inputParent) {
      const nearbyDropdowns = inputParent.querySelectorAll(
        '[class*="dropdown"], [class*="suggestion"], [role="listbox"]'
      );
      nearbyDropdowns.forEach((dropdown) => {
        if (dropdown.style.display !== "none" && dropdown.offsetHeight > 0) {
          autocompleteSelectors.push(`#${dropdown.id}`);
        }
      });
    }

    for (const selector of autocompleteSelectors) {
      try {
        const containers = document.querySelectorAll(selector);
        containers.forEach((container) => {
          // Check if container is visible
          if (
            container &&
            container.style.display !== "none" &&
            container.offsetHeight > 0 &&
            container.offsetWidth > 0
          ) {
            // Look for option elements within the container
            const optionSelectors = [
              "li",
              'div[role="option"]',
              '[role="menuitem"]',
              ".suggestion-item",
              ".autocomplete-option",
              ".dropdown-item",
              ".search-result",
              ".location-option",
              '[class*="option"]',
              '[class*="item"]',
              '[class*="result"]',
            ];

            optionSelectors.forEach((optSelector) => {
              const options = container.querySelectorAll(optSelector);
              options.forEach((option) => {
                const optionText = option.textContent.trim();
                if (optionText && optionText.length > 0) {
                  // Check if this option is clickable and relevant
                  const optionLower = optionText.toLowerCase();
                  const valueLower = value.toLowerCase();

                  if (
                    optionLower.includes(valueLower) ||
                    valueLower.includes(optionLower) ||
                    this.isLocationMatch(optionText, value)
                  ) {
                    suggestions.push(option);
                  }
                }
              });
            });
          }
        });
      } catch (e) {
        // Ignore errors for invalid selectors
        console.debug(`Selector error: ${selector}`, e);
      }
    }

    return suggestions;
  }

  isLocationMatch(suggestionText, searchValue) {
    const suggestion = suggestionText.toLowerCase();
    const search = searchValue.toLowerCase();

    // Extract city names and common location patterns
    const cityPatterns = [
      // Common city, state patterns
      /^([^,]+),?\s*([a-z]{2}|\w+)$/i,
      // Just city name
      /^([a-zA-Z\s-]+)$/,
    ];

    // Check if suggestion contains location-like patterns
    return cityPatterns.some((pattern) => {
      const match = suggestion.match(pattern);
      if (match) {
        const suggestionCity = match[1].trim().toLowerCase();
        return suggestionCity.includes(search) || search.includes(suggestionCity);
      }
      return false;
    });
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
