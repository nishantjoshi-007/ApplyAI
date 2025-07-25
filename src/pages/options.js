// Options page script
let settingsManager; // Global reference for inline event handlers

class SettingsManager {
  constructor() {
    this.selectedTones = [];
    this.maxTones = 3;
    this.experienceEntries = [];
    this.educationEntries = [];
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.bindEvents();
    this.setupFileUploads();
    this.setupToneSelection();
    this.setupTabs();
    this.setupDynamicEntries();
  }

  setupFileUploads() {
    // Profile Resume PDF upload (saves original PDF + extracts text for profile import)
    const profileResumeFile = document.getElementById("profileResumeFile");
    const resumeUploadLabel = document.getElementById("resumeUploadLabel");

    if (profileResumeFile) {
      profileResumeFile.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (file) {
          // Check if API key is available before processing
          const apiKey = document.getElementById("geminiApiKey").value.trim();
          if (!apiKey) {
            this.showStatus(
              "❌ API key required for smart resume extraction. Please add your Gemini API key first.",
              "error"
            );
            // Reset the file input
            profileResumeFile.value = "";
            return;
          }

          // Show file name
          const fileNameDisplay = document.getElementById("resumeFileName");
          if (fileNameDisplay) {
            fileNameDisplay.textContent = `📄 ${file.name}`;
            fileNameDisplay.style.display = "block";
          }

          // Show loading overlay
          this.showLoadingOverlay(true);
          this.showStatus("Uploading and processing resume...", "info");

          try {
            // Save the original file as base64
            const base64File = await this.fileToBase64(file);
            await chrome.storage.local.set({
              resumeFileOriginal: base64File,
              resumeFileName: file.name,
              resumeFileType: file.type,
            });

            // Extract text for profile import
            const extractedText = await this.parseFile(file);
            if (extractedText) {
              // Store the extracted text temporarily for import
              await chrome.storage.local.set({ resumeExtractedText: extractedText });
              this.updateLoadingText("Extracting profile information with AI...");

              // Automatically import the resume data
              await this.importFromResume();
            } else {
              this.showStatus(
                "Resume saved, but text extraction failed. You can still fill your profile manually.",
                "warning"
              );
            }
          } catch (error) {
            console.error("Error processing resume:", error);
            this.showStatus("Error processing resume. Please try again.", "error");
          } finally {
            // Hide loading overlay
            this.showLoadingOverlay(false);
          }
        }
      });

      // Add click handler to show error when disabled
      if (resumeUploadLabel) {
        resumeUploadLabel.addEventListener("click", (e) => {
          const apiKey = document.getElementById("geminiApiKey").value.trim();
          if (!apiKey) {
            e.preventDefault();
            this.showStatus("❌ Please add your Gemini API key first to enable smart resume extraction.", "error");
          }
        });
      }
    }

    // Template file upload
    const templateFile = document.getElementById("templateFile");
    if (templateFile) {
      templateFile.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (file) {
          const text = await this.parseFile(file);
          if (text) document.getElementById("coverLetterTemplate").value = text;
        }
      });
    }
  }

  async parseFile(file) {
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext === "txt") {
      return await file.text();
    }
    if (ext === "pdf") {
      return await this.parsePdfFile(file);
    }
    if (ext === "docx") {
      return await this.parseDocxFile(file);
    }
    // Fallback: try as text
    return await file.text();
  }

  async parsePdfFile(file) {
    // Use pdf.js (must be included in extension)
    if (window["pdfjsLib"]) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "../../lib/pdf.worker.js";
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const pdfjsLib = window["pdfjsLib"];
          if (!pdfjsLib) {
            alert("PDF.js library not loaded.");
            resolve("");
            return;
          }
          const typedarray = new Uint8Array(e.target.result);
          const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
          let text = "";
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map((item) => item.str).join(" ") + "\n";
          }
          resolve(text.trim());
        } catch (err) {
          alert("Failed to parse PDF: " + err.message);
          resolve("");
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
          const mammoth = window["mammoth"];
          if (!mammoth) {
            alert("Mammoth.js library not loaded.");
            resolve("");
            return;
          }
          const arrayBuffer = e.target.result;
          const result = await mammoth.extractRawText({ arrayBuffer });
          resolve(result.value.trim());
        } catch (err) {
          alert("Failed to parse DOCX: " + err.message);
          resolve("");
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // Remove the data:mime;base64, prefix and return just the base64 string
        const base64 = reader.result.split(",")[1];
        resolve({
          data: base64,
          mimeType: file.type,
          name: file.name,
          size: file.size,
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get([
        "coverLetterTemplate",
        "geminiApiKey",
        "coverLetterTones",
        "personalDetails",
        "resumeFileName",
      ]);

      if (result.coverLetterTemplate) {
        document.getElementById("coverLetterTemplate").value = result.coverLetterTemplate;
      }

      if (result.geminiApiKey) {
        document.getElementById("geminiApiKey").value = result.geminiApiKey;
      }

      // Show previously uploaded resume file name
      if (result.resumeFileName) {
        const fileNameDisplay = document.getElementById("resumeFileName");
        if (fileNameDisplay) {
          fileNameDisplay.textContent = `📄 ${result.resumeFileName}`;
          fileNameDisplay.style.display = "block";
        }
      }

      // Load selected tones
      if (result.coverLetterTones) {
        this.selectedTones = result.coverLetterTones;
        this.updateToneSelection();
      }

      // Load personal details
      if (result.personalDetails) {
        this.loadPersonalDetails(result.personalDetails);
      } else {
        // Add default entries if no personal details exist
        this.addExperienceEntry();
        this.addEducationEntry();
      }

      // Set default template if none exists
      if (!result.coverLetterTemplate) {
        this.setDefaultTemplate();
      }

      // Update resume upload state based on API key
      this.updateResumeUploadState();
    } catch (error) {
      console.error("Error loading settings:", error);
      this.showStatus("Error loading settings", "error");
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

    document.getElementById("coverLetterTemplate").value = defaultTemplate;
  }

  bindEvents() {
    document.getElementById("settingsForm").addEventListener("submit", (e) => {
      e.preventDefault();
      this.saveSettings();
    });

    document.getElementById("testBtn").addEventListener("click", () => {
      this.testConfiguration();
    });

    // Monitor API key changes to enable/disable resume upload
    const apiKeyInput = document.getElementById("geminiApiKey");
    if (apiKeyInput) {
      apiKeyInput.addEventListener("input", () => {
        this.updateResumeUploadState();
      });
    }
  }

  updateResumeUploadState() {
    const apiKey = document.getElementById("geminiApiKey").value.trim();
    const profileResumeFile = document.getElementById("profileResumeFile");
    const resumeUploadLabel = document.getElementById("resumeUploadLabel");
    const resumeUploadHelp = document.getElementById("resumeUploadHelp");

    if (apiKey) {
      // Enable upload
      if (profileResumeFile) profileResumeFile.disabled = false;
      if (resumeUploadLabel) resumeUploadLabel.classList.remove("disabled");
      if (resumeUploadHelp) resumeUploadHelp.textContent = "Resume data will be automatically imported after upload";
    } else {
      // Disable upload
      if (profileResumeFile) profileResumeFile.disabled = true;
      if (resumeUploadLabel) resumeUploadLabel.classList.add("disabled");
      if (resumeUploadHelp) resumeUploadHelp.textContent = "Add your API key first to enable smart resume extraction";
    }
  }

  showLoadingOverlay(show) {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) {
      overlay.style.display = show ? "flex" : "none";
    }
  }

  updateLoadingText(mainText, subText = "Using AI to extract your profile information") {
    const loadingText = document.querySelector(".loading-text");
    const loadingSubtext = document.querySelector(".loading-subtext");

    if (loadingText) loadingText.textContent = mainText;
    if (loadingSubtext) loadingSubtext.textContent = subText;
  }

  async saveSettings() {
    try {
      const coverLetterTemplate = document.getElementById("coverLetterTemplate").value.trim();
      const geminiApiKey = document.getElementById("geminiApiKey").value.trim();

      // Flexible validation - at least one item must be provided
      if (!coverLetterTemplate && !geminiApiKey) {
        this.showStatus("Please provide at least one setting: API key or cover letter template", "error");
        return;
      }

      // Validate API key format only if provided
      if (geminiApiKey && (!geminiApiKey.startsWith("AIzaSy") || geminiApiKey.length < 30)) {
        this.showStatus('Invalid API key format. Gemini API keys should start with "AIzaSy"', "error");
        return;
      }

      // Collect personal details
      const personalDetails = this.collectPersonalDetails();

      // Save to storage
      await chrome.storage.local.set({
        coverLetterTemplate: coverLetterTemplate,
        geminiApiKey: geminiApiKey,
        coverLetterTones: this.selectedTones,
        personalDetails: personalDetails,
      });

      // Show success message based on what was saved
      let savedItems = [];
      if (geminiApiKey) savedItems.push("API key");
      if (coverLetterTemplate) savedItems.push("cover letter template");
      if (Object.keys(personalDetails).some((key) => personalDetails[key])) savedItems.push("personal details");

      this.showStatus(`Settings saved successfully! 🎉 (${savedItems.join(", ")})`, "success");
    } catch (error) {
      console.error("Error saving settings:", error);
      this.showStatus("Error saving settings", "error");
    }
  }

  async savePersonalDetails() {
    try {
      // Collect personal details
      const personalDetails = this.collectPersonalDetails();

      // Save to storage
      await chrome.storage.local.set({
        personalDetails: personalDetails,
      });

      console.log("Personal details saved automatically after resume extraction");
    } catch (error) {
      console.error("Error saving personal details:", error);
      // Don't show error to user for auto-save, just log it
    }
  }

  async testConfiguration() {
    try {
      const geminiApiKey = document.getElementById("geminiApiKey").value.trim();

      if (!geminiApiKey) {
        this.showStatus("Please enter your Gemini API key first", "error");
        return;
      }

      this.showStatus("Testing API connection...", "info");

      // Test API call
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: 'Hello, this is a test. Please respond with "API connection successful".',
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 50,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API Error: ${errorData.error?.message || "Unknown error"}`);
      }

      const data = await response.json();

      if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        this.showStatus("✅ API connection successful! Your configuration is working.", "success");
      } else {
        throw new Error("Invalid response from API");
      }
    } catch (error) {
      console.error("Error testing configuration:", error);
      this.showStatus(`❌ API test failed: ${error.message}`, "error");
    }
  }

  setupToneSelection() {
    // Handle tone checkboxes
    const toneCheckboxes = document.querySelectorAll('input[name="tones"]');
    toneCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", (e) => {
        if (e.target.checked) {
          if (this.selectedTones.length >= this.maxTones) {
            e.target.checked = false;
            this.showStatus(`You can select up to ${this.maxTones} tones only`, "error");
            return;
          }
          this.selectedTones.push(e.target.value);
        } else {
          this.selectedTones = this.selectedTones.filter((tone) => tone !== e.target.value);
        }
        this.updateToneDisplay();
      });
    });

    // Handle custom tone addition
    const addCustomToneBtn = document.getElementById("addCustomToneBtn");
    const customToneInput = document.getElementById("customTone");

    addCustomToneBtn.addEventListener("click", () => {
      const customTone = customToneInput.value.trim();
      if (!customTone) {
        this.showStatus("Please enter a custom tone", "error");
        return;
      }

      if (this.selectedTones.length >= this.maxTones) {
        this.showStatus(`You can select up to ${this.maxTones} tones only`, "error");
        return;
      }

      if (this.selectedTones.includes(customTone)) {
        this.showStatus("This tone is already selected", "error");
        return;
      }

      this.selectedTones.push(customTone);
      customToneInput.value = "";
      this.updateToneDisplay();
    });

    // Allow Enter key to add custom tone
    customToneInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        addCustomToneBtn.click();
      }
    });
  }

  updateToneSelection() {
    // Update checkboxes based on selected tones
    const toneCheckboxes = document.querySelectorAll('input[name="tones"]');
    toneCheckboxes.forEach((checkbox) => {
      checkbox.checked = this.selectedTones.includes(checkbox.value);
    });
    this.updateToneDisplay();
  }

  updateToneDisplay() {
    const tonesList = document.getElementById("tonesList");
    const selectedTonesDiv = document.getElementById("selectedTones");

    if (this.selectedTones.length === 0) {
      selectedTonesDiv.style.display = "none";
      return;
    }

    selectedTonesDiv.style.display = "block";
    tonesList.innerHTML = this.selectedTones
      .map(
        (tone) =>
          `<span class="tone-tag">
                ${tone}
                <span class="remove-tone" data-tone="${tone}">×</span>
            </span>`
      )
      .join("");

    // Add remove functionality
    document.querySelectorAll(".remove-tone").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const toneToRemove = e.target.getAttribute("data-tone");
        this.selectedTones = this.selectedTones.filter((tone) => tone !== toneToRemove);

        // Uncheck corresponding checkbox if it exists
        const checkbox = document.querySelector(`input[name="tones"][value="${toneToRemove}"]`);
        if (checkbox) checkbox.checked = false;

        this.updateToneDisplay();
      });
    });
  }

  showStatus(message, type) {
    const statusElement = document.getElementById("statusMessage");

    if (statusElement) {
      statusElement.textContent = message;
      statusElement.className = `status ${type}`;
      statusElement.style.display = "block";

      // Auto-hide success messages after 5 seconds
      if (type === "success") {
        setTimeout(() => {
          statusElement.style.display = "none";
        }, 5000);
      }

      // Scroll to top to show the message
      window.scrollTo(0, 0);
    }
  }

  // Personal Details Methods
  collectPersonalDetails() {
    const personalDetails = {
      // Basic Information
      firstName: document.getElementById("firstName").value.trim(),
      lastName: document.getElementById("lastName").value.trim(),
      email: document.getElementById("email").value.trim(),
      phone: document.getElementById("phone").value.trim(),

      // Professional URLs
      linkedinUrl: document.getElementById("linkedinUrl").value.trim(),
      portfolioUrl: document.getElementById("portfolioUrl").value.trim(),
      githubUrl: document.getElementById("githubUrl").value.trim(),

      // Address Information
      address1: document.getElementById("address1").value.trim(),
      address2: document.getElementById("address2").value.trim(),
      city: document.getElementById("city").value.trim(),
      state: document.getElementById("state").value.trim(),
      zipCode: document.getElementById("zipCode").value.trim(),
      country: document.getElementById("country").value.trim(),

      // Professional Information
      totalExperience: document.getElementById("totalExperience").value.trim(),
      desiredSalary: document.getElementById("desiredSalary").value.trim(),

      // Work Experience
      workExperience: this.experienceEntries,

      // Education Information
      education: this.educationEntries,

      // Work Authorization
      workAuthorization: document.getElementById("workAuthorization").value,
      availableStartDate: document.getElementById("availableStartDate").value,
      willingToRelocate: document.getElementById("willingToRelocate").checked,
      remoteWork: document.getElementById("remoteWork").checked,

      // Equal Opportunity Information
      gender: document.getElementById("gender").value,
      race: document.getElementById("race").value,
      veteranStatus: document.getElementById("veteranStatus").value,
      disabilityStatus: document.getElementById("disabilityStatus").value,
    };

    return personalDetails;
  }

  loadPersonalDetails(personalDetails) {
    const fields = [
      "firstName",
      "lastName",
      "email",
      "phone",
      "linkedinUrl",
      "portfolioUrl",
      "githubUrl",
      "address1",
      "address2",
      "city",
      "state",
      "zipCode",
      "country",
      "totalExperience",
      "desiredSalary",
      "workAuthorization",
      "availableStartDate",
      "gender",
      "race",
      "veteranStatus",
      "disabilityStatus",
    ];

    fields.forEach((field) => {
      const element = document.getElementById(field);
      if (element && personalDetails[field]) {
        element.value = personalDetails[field];
      }
    });

    // Handle checkboxes
    if (personalDetails.willingToRelocate !== undefined) {
      document.getElementById("willingToRelocate").checked = personalDetails.willingToRelocate;
    }
    if (personalDetails.remoteWork !== undefined) {
      document.getElementById("remoteWork").checked = personalDetails.remoteWork;
    }

    // Load work experience entries
    if (personalDetails.workExperience && personalDetails.workExperience.length > 0) {
      this.experienceEntries = personalDetails.workExperience;
      this.renderExperienceEntries();
    } else {
      // Add one default experience entry
      this.addExperienceEntry();
    }

    // Load education entries
    if (personalDetails.education && personalDetails.education.length > 0) {
      this.educationEntries = personalDetails.education;
      this.renderEducationEntries();
    } else {
      // Add one default education entry
      this.addEducationEntry();
    }
  }

  async importFromResume() {
    try {
      // Check if API key is set for auto-extraction
      if (!document.getElementById("geminiApiKey").value.trim()) {
        this.showStatus(
          "✅ Resume uploaded and saved! Add your API key to enable automatic profile data extraction.",
          "success"
        );
        return;
      }

      // Get the resume details from storage
      const result = await chrome.storage.local.get(["resumeExtractedText"]);
      const resumeText = result.resumeExtractedText;

      if (!resumeText) {
        this.showStatus("Resume uploaded but text extraction failed. Please fill your profile manually.", "warning");
        return;
      }

      this.showStatus("Extracting information from uploaded resume...", "info");

      const extractedInfo = await this.extractInfoFromResume(resumeText);

      if (extractedInfo) {
        this.populateFieldsFromExtractedInfo(extractedInfo);
        // Automatically save the extracted profile data
        await this.savePersonalDetails();
        this.showStatus("✅ Resume uploaded and profile data automatically imported and saved!", "success");
      } else {
        this.showStatus("✅ Resume uploaded! Could not auto-extract profile data. Please fill manually.", "warning");
      }
    } catch (error) {
      console.error("Error importing from resume:", error);
      this.showStatus("✅ Resume uploaded! Auto-import failed, please fill manually.", "warning");
    }
  }

  async extractInfoFromResume(resumeText) {
    const apiKey = document.getElementById("geminiApiKey").value.trim();

    const prompt = `Extract the following personal information from this resume text and return it in JSON format. If any information is not available, leave the field empty.

Resume Text:
${resumeText}

Please extract and return ONLY a valid JSON object with these fields:
{
  "firstName": "",
  "lastName": "",
  "email": "",
  "phone": "",
  "address1": "",
  "city": "",
  "state": "",
  "zipCode": "",
  "country": "",
  "currentTitle": "",
  "currentCompany": "",
  "totalExperience": "",
  "linkedinUrl": "",
  "portfolioUrl": "",
  "githubUrl": "",
  "workExperience": [
    {
      "title": "",
      "company": "",
      "location": "",
      "startDate": "YYYY-MM",
      "endDate": "YYYY-MM",
      "current": false,
      "description": ""
    }
  ],
  "education": [
    {
      "university": "",
      "degree": "",
      "major": "",
      "location": "",
      "startDate": "YYYY-MM",
      "endDate": "YYYY-MM",
      "gpa": ""
    }
  ]
}

IMPORTANT URL FORMATTING RULES:
- For linkedinUrl: Always return as complete URL starting with "https://www.linkedin.com/in/" even if only partial info is found (e.g., if you find "linkedin.com/in/johndoe" or "johndoe" with LinkedIn context, return "https://www.linkedin.com/in/johndoe")
- For portfolioUrl: Always return as complete URL starting with "https://www." (e.g., if you find "myportfolio.com", return "https://www.myportfolio.com")
- For githubUrl: Always return as complete URL starting with "https://github.com/" (e.g., if you find "github.com/username" or just "username" with GitHub context, return "https://github.com/username")
- If a URL already starts with http:// or https://, keep it as is
- If no URL information is found, leave the field empty

For workExperience and education arrays, include all relevant entries found in the resume. Use YYYY-MM format for dates.

Return only the JSON object, no additional text or explanation.`;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 2000,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error("API request failed");
      }

      const data = await response.json();
      if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        const text = data.candidates[0].content.parts[0].text;
        // Try to extract JSON from the response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      }

      return null;
    } catch (error) {
      console.error("Error extracting info from resume:", error);
      return null;
    }
  }

  populateFieldsFromExtractedInfo(info) {
    // Populate simple fields with validation
    Object.keys(info).forEach((key) => {
      if (key !== "workExperience" && key !== "education") {
        const element = document.getElementById(key);
        if (element && info[key] && info[key].trim && info[key].trim()) {
          let value = info[key].trim();

          // Special handling for totalExperience field
          if (key === "totalExperience") {
            // Extract numbers from text like "two years", "3 years", etc.
            const numberMatch = value.match(/(\d+)/);
            if (numberMatch) {
              value = numberMatch[1];
            } else {
              // Try to convert text numbers to digits
              const textNumbers = {
                one: "1",
                two: "2",
                three: "3",
                four: "4",
                five: "5",
                six: "6",
                seven: "7",
                eight: "8",
                nine: "9",
                ten: "10",
              };
              const lowerValue = value.toLowerCase();
              for (const [text, num] of Object.entries(textNumbers)) {
                if (lowerValue.includes(text)) {
                  value = num;
                  break;
                }
              }
            }
            // Only set if it's a valid number
            if (/^\d+$/.test(value)) {
              element.value = value;
            }
          } else {
            element.value = value;
          }
        }
      }
    });

    // Populate work experience with date validation
    if (info.workExperience && Array.isArray(info.workExperience) && info.workExperience.length > 0) {
      this.experienceEntries = info.workExperience.map((exp) => ({
        id: Date.now() + Math.random(),
        title: exp.title || "",
        company: exp.company || "",
        location: exp.location || "",
        startDate: this.validateMonthInput(exp.startDate),
        endDate: exp.current ? "" : this.validateMonthInput(exp.endDate),
        current: exp.current || false,
        description: exp.description || "",
      }));
      this.renderExperienceEntries();
    }

    // Populate education with date validation
    if (info.education && Array.isArray(info.education) && info.education.length > 0) {
      this.educationEntries = info.education.map((edu) => ({
        id: Date.now() + Math.random(),
        university: edu.university || "",
        degree: edu.degree || "",
        major: edu.major || "",
        location: edu.location || "",
        startDate: this.validateMonthInput(edu.startDate),
        endDate: this.validateMonthInput(edu.endDate),
        gpa: edu.gpa || "",
      }));
      this.renderEducationEntries();
    }
  }

  validateMonthInput(dateString) {
    if (!dateString) return "";

    // If it's already in YYYY-MM format, return it
    if (/^\d{4}-\d{2}$/.test(dateString)) {
      return dateString;
    }

    // If it contains "Present" or "Current", return empty (will be handled by current checkbox)
    if (/present|current/i.test(dateString)) {
      return "";
    }

    // Try to extract year and month from various formats
    const yearMatch = dateString.match(/20\d{2}|\d{4}/);
    if (yearMatch) {
      const year = yearMatch[0];
      // Try to extract month (default to January if not found)
      const monthMatch = dateString.match(
        /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2})\b/i
      );
      let month = "01";

      if (monthMatch) {
        const monthStr = monthMatch[0].toLowerCase();
        const monthMap = {
          jan: "01",
          january: "01",
          feb: "02",
          february: "02",
          mar: "03",
          march: "03",
          apr: "04",
          april: "04",
          may: "05",
          jun: "06",
          june: "06",
          jul: "07",
          july: "07",
          aug: "08",
          august: "08",
          sep: "09",
          september: "09",
          oct: "10",
          october: "10",
          nov: "11",
          november: "11",
          dec: "12",
          december: "12",
        };

        if (monthMap[monthStr]) {
          month = monthMap[monthStr];
        } else if (/^\d{1,2}$/.test(monthStr)) {
          month = monthStr.padStart(2, "0");
        }
      }

      return `${year}-${month}`;
    }

    return "";
  }

  // Tab Management
  setupTabs() {
    var tabButtons = document.querySelectorAll(".tab-button");
    var tabContents = document.querySelectorAll(".tab-content");

    console.log("Setting up tabs - found", tabButtons.length, "tab buttons and", tabContents.length, "tab contents");

    function switchTab(e) {
      try {
        var targetTab = e.target.getAttribute("data-tab");
        var targetContent = document.getElementById(targetTab);

        console.log("Switching to tab:", targetTab);

        if (!targetContent) {
          console.error("Tab content not found for: " + targetTab);
          return;
        }

        // Remove active class from all tabs and contents
        tabButtons.forEach(function (btn) {
          btn.classList.remove("active");
        });
        tabContents.forEach(function (content) {
          content.classList.remove("active");
        });

        // Add active class to clicked tab and corresponding content
        e.target.classList.add("active");
        targetContent.classList.add("active");

        console.log("Tab switched successfully to:", targetTab);
      } catch (error) {
        console.error("Error switching tabs:", error);
      }
    }

    // Bind click events to each tab button
    tabButtons.forEach(function (button, index) {
      console.log("Binding click event to tab button", index, "with data-tab:", button.getAttribute("data-tab"));
      button.addEventListener("click", switchTab);
    });

    // Set the first tab as active by default if no tab is currently active
    var activeTab = document.querySelector(".tab-button.active");
    if (!activeTab && tabButtons.length > 0) {
      console.log("No active tab found, setting first tab as active");
      tabButtons[0].classList.add("active");
      var firstTabId = tabButtons[0].getAttribute("data-tab");
      var firstContent = document.getElementById(firstTabId);
      if (firstContent) {
        firstContent.classList.add("active");
      }
    } else {
      console.log("Active tab found:", activeTab ? activeTab.getAttribute("data-tab") : "none");
    }
  }

  // Dynamic Entries Management
  setupDynamicEntries() {
    // Setup add entry buttons
    document.querySelectorAll(".add-entry-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const type = e.target.getAttribute("data-type");
        if (type === "experience") {
          this.addExperienceEntry();
        } else if (type === "education") {
          this.addEducationEntry();
        }
      });
    });

    // Initialize with default entries if none exist
    if (this.experienceEntries.length === 0) {
      this.addExperienceEntry();
    }
    if (this.educationEntries.length === 0) {
      this.addEducationEntry();
    }
  }

  addExperienceEntry() {
    const entry = {
      id: Date.now(),
      title: "",
      company: "",
      location: "",
      startDate: "",
      endDate: "",
      current: false,
      description: "",
    };

    this.experienceEntries.push(entry);
    this.renderExperienceEntries();
  }

  addEducationEntry() {
    const entry = {
      id: Date.now(),
      university: "",
      degree: "",
      major: "",
      startDate: "",
      endDate: "",
      gpa: "",
      location: "",
    };

    this.educationEntries.push(entry);
    this.renderEducationEntries();
  }

  removeExperienceEntry(id) {
    this.experienceEntries = this.experienceEntries.filter((entry) => entry.id !== id);
    this.renderExperienceEntries();
  }

  removeEducationEntry(id) {
    this.educationEntries = this.educationEntries.filter((entry) => entry.id !== id);
    this.renderEducationEntries();
  }

  renderExperienceEntries() {
    const container = document.getElementById("experienceEntries");
    container.innerHTML = "";

    this.experienceEntries.forEach((entry, index) => {
      const entryElement = this.createExperienceEntryElement(entry, index);
      container.appendChild(entryElement);
    });
  }

  renderEducationEntries() {
    const container = document.getElementById("educationEntries");
    container.innerHTML = "";

    this.educationEntries.forEach((entry, index) => {
      const entryElement = this.createEducationEntryElement(entry, index);
      container.appendChild(entryElement);
    });
  }

  createExperienceEntryElement(entry, index) {
    const div = document.createElement("div");
    div.className = "entry-item";
    div.innerHTML = `
            <div class="entry-header">
                <span class="entry-number">Experience ${index + 1}</span>
                ${
                  this.experienceEntries.length > 1
                    ? `<button type="button" class="remove-entry-btn" data-remove-id="${entry.id}" data-type="experience">Remove</button>`
                    : ""
                }
            </div>
            <div class="entry-fields">
                <div class="entry-row">
                    <div class="form-col">
                        <label>Job Title</label>
                        <input type="text" data-field="title" data-id="${entry.id}" value="${
      entry.title
    }" placeholder="e.g., Software Engineer">
                    </div>
                    <div class="form-col">
                        <label>Company</label>
                        <input type="text" data-field="company" data-id="${entry.id}" value="${
      entry.company
    }" placeholder="e.g., Google">
                    </div>
                </div>
                <div class="entry-row">
                    <div class="form-col">
                        <label>Location</label>
                        <input type="text" data-field="location" data-id="${entry.id}" value="${
      entry.location
    }" placeholder="e.g., San Francisco, CA">
                    </div>
                    <div class="form-col">
                        <label>Start Date</label>
                        <input type="month" data-field="startDate" data-id="${entry.id}" value="${entry.startDate}">
                    </div>
                </div>
                <div class="entry-row">
                    <div class="form-col">
                        <label>End Date</label>
                        <input type="month" data-field="endDate" data-id="${entry.id}" value="${entry.endDate}" ${
      entry.current ? "disabled" : ""
    }>
                    </div>
                    <div class="form-col">
                        <label>
                            <input type="checkbox" data-field="current" data-id="${entry.id}" ${
      entry.current ? "checked" : ""
    }> Current Position
                        </label>
                    </div>
                </div>
                <div class="entry-row">
                    <div class="form-col full-width">
                        <label>Description (Optional)</label>
                        <textarea data-field="description" data-id="${
                          entry.id
                        }" rows="2" placeholder="Brief description of your role and achievements">${
      entry.description
    }</textarea>
                    </div>
                </div>
            </div>
        `;

    // Add event listener for remove button
    const removeBtn = div.querySelector(".remove-entry-btn");
    if (removeBtn) {
      removeBtn.addEventListener("click", () => {
        this.removeExperienceEntry(entry.id);
      });
    }

    // Add event listeners for fields
    div.querySelectorAll("[data-field]").forEach((field) => {
      field.addEventListener("input", (e) => {
        this.updateExperienceEntry(entry.id, e.target.getAttribute("data-field"), e.target.value);
      });
      field.addEventListener("change", (e) => {
        if (e.target.type === "checkbox") {
          this.updateExperienceEntry(entry.id, e.target.getAttribute("data-field"), e.target.checked);
          // Disable/enable end date based on current checkbox
          if (e.target.getAttribute("data-field") === "current") {
            const endDateField = div.querySelector('[data-field="endDate"]');
            endDateField.disabled = e.target.checked;
            if (e.target.checked) endDateField.value = "";
          }
        }
      });
    });

    return div;
  }

  createEducationEntryElement(entry, index) {
    const div = document.createElement("div");
    div.className = "entry-item";
    div.innerHTML = `
            <div class="entry-header">
                <span class="entry-number">Education ${index + 1}</span>
                ${
                  this.educationEntries.length > 1
                    ? `<button type="button" class="remove-entry-btn" data-remove-id="${entry.id}" data-type="education">Remove</button>`
                    : ""
                }
            </div>
            <div class="entry-fields">
                <div class="entry-row">
                    <div class="form-col">
                        <label>University/School</label>
                        <input type="text" data-field="university" data-id="${entry.id}" value="${
      entry.university
    }" placeholder="e.g., Stanford University">
                    </div>
                    <div class="form-col">
                        <label>Degree</label>
                        <input type="text" data-field="degree" data-id="${entry.id}" value="${
      entry.degree
    }" placeholder="e.g., Bachelor of Science">
                    </div>
                </div>
                <div class="entry-row">
                    <div class="form-col">
                        <label>Major/Field of Study</label>
                        <input type="text" data-field="major" data-id="${entry.id}" value="${
      entry.major
    }" placeholder="e.g., Computer Science">
                    </div>
                    <div class="form-col">
                        <label>Location</label>
                        <input type="text" data-field="location" data-id="${entry.id}" value="${
      entry.location
    }" placeholder="e.g., Stanford, CA">
                    </div>
                </div>
                <div class="entry-row">
                    <div class="form-col">
                        <label>Start Date</label>
                        <input type="month" data-field="startDate" data-id="${entry.id}" value="${entry.startDate}">
                    </div>
                    <div class="form-col">
                        <label>End Date</label>
                        <input type="month" data-field="endDate" data-id="${entry.id}" value="${entry.endDate}">
                    </div>
                </div>
                <div class="entry-row">
                    <div class="form-col">
                        <label>GPA (Optional)</label>
                        <input type="text" data-field="gpa" data-id="${entry.id}" value="${
      entry.gpa
    }" placeholder="e.g., 3.8/4.0">
                    </div>
                </div>
            </div>
        `;

    // Add event listener for remove button
    const removeBtn = div.querySelector(".remove-entry-btn");
    if (removeBtn) {
      removeBtn.addEventListener("click", () => {
        this.removeEducationEntry(entry.id);
      });
    }

    // Add event listeners for fields
    div.querySelectorAll("[data-field]").forEach((field) => {
      field.addEventListener("input", (e) => {
        this.updateEducationEntry(entry.id, e.target.getAttribute("data-field"), e.target.value);
      });
    });

    return div;
  }

  updateExperienceEntry(id, field, value) {
    const entry = this.experienceEntries.find((e) => e.id === id);
    if (entry) {
      entry[field] = value;
    }
  }

  updateEducationEntry(id, field, value) {
    const entry = this.educationEntries.find((e) => e.id === id);
    if (entry) {
      entry[field] = value;
    }
  }
}

// Initialize settings manager when page loads
document.addEventListener("DOMContentLoaded", () => {
  settingsManager = new SettingsManager();
});
