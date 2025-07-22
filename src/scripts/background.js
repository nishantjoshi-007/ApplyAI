// Background script for Chrome extension

// Handle installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
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
    const result = await chrome.storage.local.get(["firstRun"]);
    if (!result.firstRun) {
      await chrome.storage.local.set({
        firstRun: false,
        installDate: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error handling installation:", error);
  }
}

function handleMessage(request, sender, sendResponse) {
  switch (request.action) {
    case "getJobDescription":
      getJobDescription(sender.tab.id)
        .then((response) => sendResponse(response))
        .catch((error) => sendResponse({ error: error.message }));
      break;

    case "generateCoverLetter":
      generateCoverLetter(request.data)
        .then((response) => sendResponse(response))
        .catch((error) => sendResponse({ error: error.message }));
      break;

    case "generateJobApplicationResponses":
      generateJobApplicationResponses(request)
        .then((response) => sendResponse(response))
        .catch((error) => sendResponse({ error: error.message }));
      break;

    case "openOptionsPage":
      chrome.runtime.openOptionsPage();
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ error: "Unknown action" });
  }
}

async function getJobDescription(tabId) {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      function: () => {
        // This function runs in the context of the tab
        const extractor = new JobDescriptionExtractor();
        return extractor.extractJobDescription();
      },
    });

    return {
      success: true,
      jobDescription: result[0]?.result || "Could not extract job description",
    };
  } catch (error) {
    console.error("Error getting job description:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function generateCoverLetter(data) {
  try {
    const { jobDescription } = data;
    const settings = await chrome.storage.local.get(["resume", "coverLetterTemplate", "geminiApiKey"]);

    if (!settings.resume || !settings.coverLetterTemplate || !settings.geminiApiKey) {
      throw new Error("Missing required settings. Please configure your resume, template, and API key.");
    }

    const coverLetter = await callGeminiAPI(
      jobDescription,
      settings.resume,
      settings.coverLetterTemplate,
      settings.geminiApiKey
    );

    return {
      success: true,
      coverLetter: coverLetter,
    };
  } catch (error) {
    console.error("Error generating cover letter:", error);
    return {
      success: false,
      error: error.message,
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
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Gemini API error: ${errorData.error?.message || "Unknown error"}`);
  }

  const data = await response.json();

  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
    throw new Error("Invalid response from Gemini API");
  }

  return data.candidates[0].content.parts[0].text;
}

async function generateJobApplicationResponses(request) {
  try {
    const { userProfile, questions, instructions } = request;
    const settings = await chrome.storage.local.get(["geminiApiKey"]);

    if (!settings.geminiApiKey) {
      throw new Error("Missing Gemini API key. Please configure in settings.");
    }

    console.log(`Generating AI responses for ${questions.length} questions`);

    const responses = await callGeminiForApplicationResponses(
      userProfile,
      questions,
      instructions,
      settings.geminiApiKey
    );

    return {
      success: true,
      responses: responses,
    };
  } catch (error) {
    console.error("Error generating job application responses:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function callGeminiForApplicationResponses(userProfile, questions, instructions, apiKey) {
  const profileText = Object.entries(userProfile)
    .filter(([key, value]) => value && value !== "")
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  const questionsList = questions
    .map(
      (q, index) =>
        `${index + 1}. Question: "${q.question}"
    Field Type: ${q.fieldType}
    Max Length: ${q.maxLength} characters
    Is Textarea: ${q.isTextarea}`
    )
    .join("\n\n");

  const prompt = `
You are an AI assistant helping with job applications. Based on the user's profile, generate professional and personalized responses to job application questions.

USER PROFILE:
${profileText}

QUESTIONS TO ANSWER:
${questionsList}

INSTRUCTIONS:
${instructions}

IMPORTANT GUIDELINES:
1. Keep responses concise and within the specified character limits
2. Make responses sound natural and professional
3. Base responses on the user's actual profile information
4. For technical questions, focus on relevant experience and skills
5. For motivation/interest questions, show genuine enthusiasm
6. For percentage questions, provide realistic numbers based on the context
7. Avoid generic or templated language
8. Return responses in JSON format with question text as key and response as value

Please return ONLY a JSON object where each key is the exact question text and the value is the generated response. Example format:
{
  "Why are you interested in this role?": "I am passionate about...",
  "What percentage of time do you enjoy coding?": "85%"
}
`;

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
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Gemini API error: ${errorData.error?.message || "Unknown error"}`);
  }

  const data = await response.json();

  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
    throw new Error("Invalid response from Gemini API");
  }

  const responseText = data.candidates[0].content.parts[0].text;

  try {
    // Extract JSON from the response (remove any markdown formatting)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    } else {
      // Fallback: try to parse the entire response
      return JSON.parse(responseText);
    }
  } catch (parseError) {
    console.error("Error parsing AI response:", parseError);
    console.log("Raw response:", responseText);

    // Fallback: return empty responses object
    const fallbackResponses = {};
    questions.forEach((q) => {
      fallbackResponses[q.question] = "Unable to generate response";
    });
    return fallbackResponses;
  }
}

function setupContextMenu() {
  // Optional: Add context menu for future enhancements
  // Check if contextMenus API is available
  if (chrome.contextMenus) {
    try {
      chrome.contextMenus.removeAll(() => {
        if (chrome.runtime.lastError) {
          console.log("Context menu setup skipped:", chrome.runtime.lastError);
          return;
        }

        chrome.contextMenus.create({
          id: "generateCoverLetter",
          title: "Generate Cover Letter",
          contexts: ["selection", "page"],
          documentUrlPatterns: [
            "*://*.linkedin.com/*",
            "*://*.indeed.com/*",
            "*://*.glassdoor.com/*",
            "*://*.angel.co/*",
            "*://*.wellfound.com/*",
          ],
        });
      });

      chrome.contextMenus.onClicked.addListener((info, tab) => {
        if (info.menuItemId === "generateCoverLetter") {
          // Open popup or trigger generation
          chrome.action.openPopup();
        }
      });
    } catch (error) {
      console.log("Context menu setup failed:", error);
    }
  }
}
