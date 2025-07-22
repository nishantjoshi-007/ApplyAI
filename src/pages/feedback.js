// Feedback page JavaScript
document.addEventListener("DOMContentLoaded", function () {
  // Handle feedback type selection
  document.querySelectorAll(".feedback-type").forEach((type) => {
    type.addEventListener("click", function () {
      console.log("Feedback type clicked:", this.dataset.type); // Debug log

      // Remove selected class from all types
      document.querySelectorAll(".feedback-type").forEach((t) => {
        t.classList.remove("selected");
        console.log("Removed selected from:", t.dataset.type); // Debug log
      });

      // Add selected class to clicked type
      this.classList.add("selected");
      console.log("Added selected to:", this.dataset.type); // Debug log

      // Set hidden input value
      const feedbackType = this.dataset.type;
      document.getElementById("feedbackType").value = feedbackType;

      // Update subject placeholder based on type
      const subjectInput = document.getElementById("subject");
      const placeholders = {
        bug: "Bug: Brief description of the issue",
        feature: "Feature Request: What would you like to see?",
        improvement: "Improvement: How can we make it better?",
        general: "General: Your thoughts or questions",
      };
      subjectInput.placeholder = placeholders[feedbackType] || subjectInput.placeholder;
    });
  });

  // Auto-fill browser info
  window.addEventListener("load", function () {
    const browserInfo = `${navigator.userAgent.includes("Chrome") ? "Chrome" : "Browser"} ${
      navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] || "Unknown"
    }`;
    document.getElementById("browser").value = browserInfo + ", ApplyAI v1.0";
  });

  // Form submission handling
  document.querySelector(".feedback-form").addEventListener("submit", function (e) {
    const submitBtn = document.querySelector(".submit-btn");
    submitBtn.textContent = "Sending...";
    submitBtn.disabled = true;

    // Re-enable button after a delay (in case of errors)
    setTimeout(() => {
      submitBtn.textContent = "Send Feedback";
      submitBtn.disabled = false;
    }, 5000);
  });
});
