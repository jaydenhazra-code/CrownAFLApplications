
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  // Main page sections
  const hero = $("hero");
  const beginBtn = $("beginBtn");
  const loadingPanel = $("loadingPanel");
  const applicationPanel = $("applicationForm");
  const applicationFields = $("applicationFields");
  const submitLoading = $("submitLoading");
  const successPanel = $("successPanel");
  const backHomeBtn = $("backHomeBtn");

  // Loading screen elements
  const countdown = $("countdown");
  const progressBar = $("progressBar");
  const loadingTitle = $("loadingTitle");
  const loadingText = $("loadingText");

  // Form feedback
  const formError = $("formError");

  // Stop early and report missing HTML elements clearly.
  const requiredElements = {
    hero,
    beginBtn,
    loadingPanel,
    applicationPanel,
    applicationFields,
    submitLoading,
    successPanel
  };

  const missingElements = Object.entries(requiredElements)
    .filter(([, element]) => !element)
    .map(([id]) => id);

  if (missingElements.length > 0) {
    console.error(
      "Crown RP: Missing HTML elements:",
      missingElements.join(", ")
    );
    return;
  }

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  let introTimer = null;
  let isSubmitting = false;

  const introDuration = reducedMotion ? 1 : 10;

  const introMessages = [
    {
      title: "Initializing recruitment",
      text: "Preparing your Crown RP experience..."
    },
    {
      title: "Reviewing AFL standards",
      text: "Respect, professionalism and teamwork."
    },
    {
      title: "Preparing your application",
      text: "Take your time. Every answer matters."
    },
    {
      title: "Almost ready",
      text: "Your opportunity to join AFL starts here."
    }
  ];

  /**
   * Show one section and hide the others.
   */
  function showPanel(activePanel) {
    const panels = [
      hero,
      loadingPanel,
      applicationPanel,
      submitLoading,
      successPanel
    ];

    panels.forEach((panel) => {
      const isActive = panel === activePanel;

      panel.classList.toggle("hidden", !isActive);
      panel.setAttribute("aria-hidden", String(!isActive));
    });

    if (!reducedMotion && typeof activePanel.animate === "function") {
      activePanel.animate(
        [
          { opacity: 0, transform: "translateY(14px)" },
          { opacity: 1, transform: "translateY(0)" }
        ],
        {
          duration: 450,
          easing: "cubic-bezier(0.2, 0.8, 0.2, 1)"
        }
      );
    }

    if (activePanel === hero) {
      window.scrollTo({
        top: 0,
        behavior: reducedMotion ? "auto" : "smooth"
      });
    } else {
      activePanel.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start"
      });
    }
  }

  /**
   * Update the preparation progress bar.
   */
  function updateProgress(percent) {
    if (!progressBar) return;

    const value = Math.max(0, Math.min(100, percent));

    progressBar.style.width = `${value}%`;

    const track = progressBar.closest('[role="progressbar"]');

    if (track) {
      track.setAttribute("aria-valuenow", String(value));
    }
  }

  /**
   * Clear the preparation countdown if it is running.
   */
  function stopIntroTimer() {
    if (introTimer !== null) {
      clearInterval(introTimer);
      introTimer = null;
    }
  }

  /**
   * Begin the animated application preparation sequence.
   */
  function startApplication() {
    if (introTimer !== null) return;

    beginBtn.disabled = true;

    showPanel(loadingPanel);

    let secondsRemaining = introDuration;

    if (countdown) {
      countdown.textContent = String(secondsRemaining);
    }

    if (loadingTitle) {
      loadingTitle.textContent = introMessages[0].title;
    }

    if (loadingText) {
      loadingText.textContent = introMessages[0].text;
    }

    updateProgress(0);

    introTimer = setInterval(() => {
      secondsRemaining = Math.max(0, secondsRemaining - 1);

      if (countdown) {
        countdown.textContent = String(secondsRemaining);
      }

      const elapsed = introDuration - secondsRemaining;
      const percent = Math.round((elapsed / introDuration) * 100);

      updateProgress(percent);

      const messageIndex = Math.min(
        introMessages.length - 1,
        Math.floor((elapsed / introDuration) * introMessages.length)
      );

      const message = introMessages[messageIndex];

      if (loadingTitle) {
        loadingTitle.textContent = message.title;
      }

      if (loadingText) {
        loadingText.textContent = message.text;
      }

      if (secondsRemaining <= 0) {
        stopIntroTimer();

        beginBtn.disabled = false;

        showPanel(applicationPanel);

        const firstField = applicationFields.querySelector(
          'input:not([type="hidden"]), select, textarea'
        );

        if (firstField) {
          window.setTimeout(() => firstField.focus(), 300);
        }
      }
    }, 1000);
  }

  /**
   * Submit the application to the existing Express/Discord endpoint.
   */
  async function submitApplication(event) {
    event.preventDefault();

    // Prevent duplicate requests from repeated clicks.
    if (isSubmitting) return;

    if (formError) {
      formError.textContent = "";
    }

    // Browser validates required fields, Discord ID format, and lengths.
    if (!applicationFields.reportValidity()) {
      return;
    }

    const submitButton = applicationFields.querySelector(
      'button[type="submit"], input[type="submit"]'
    );

    const originalButtonText = submitButton
      ? submitButton.textContent
      : "";

    // Collect values using the actual HTML form, not the outer section.
    const data = Object.fromEntries(
      new FormData(applicationFields).entries()
    );

    isSubmitting = true;

    if (submitButton) {
      submitButton.disabled = true;

      if (submitButton.tagName === "BUTTON") {
        submitButton.textContent = "Submitting...";
      }
    }

    showPanel(submitLoading);

    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
      });

      let result;

      try {
        result = await response.json();
      } catch {
        throw new Error(
          "The server returned an invalid response. Please try again."
        );
      }

      if (!response.ok) {
        throw new Error(
          result.error || "Your application could not be submitted."
        );
      }

      // Only show success when the server confirms submission.
      showPanel(successPanel);
    } catch (error) {
      console.error("Crown RP application submission failed:", error);

      showPanel(applicationPanel);

      if (formError) {
        formError.textContent =
          error.message ||
          "Something went wrong. Please check your connection and try again.";
      }
    } finally {
      isSubmitting = false;

      if (submitButton) {
        submitButton.disabled = false;

        if (submitButton.tagName === "BUTTON") {
          submitButton.textContent = originalButtonText;
        }
      }
    }
  }

  /**
   * Return to the welcome screen.
   */
  function returnHome() {
    if (isSubmitting) return;

    stopIntroTimer();

    beginBtn.disabled = false;

    applicationFields.reset();

    if (formError) {
      formError.textContent = "";
    }

    updateProgress(0);

    showPanel(hero);
  }

  // Wire up the controls.
  beginBtn.addEventListener("click", startApplication);

  applicationFields.addEventListener(
    "submit",
    submitApplication
  );

  if (backHomeBtn) {
    backHomeBtn.addEventListener("click", returnHome);
  }

  // Display the correct initial screen.
  stopIntroTimer();
  beginBtn.disabled = false;
  showPanel(hero);

  console.log("Crown RP: Recruitment website initialized successfully.");
});
