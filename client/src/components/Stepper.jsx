import React, { Children, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import "./Stepper.css";

export default function Stepper({
  children,
  initialStep = 1,
  onStepChange = () => {},
  onFinalStepCompleted = () => {},
  onBeforeStepChange = () => true,
  stepCircleContainerClassName = "",
  stepContainerClassName = "",
  contentClassName = "",
  footerClassName = "",
  backButtonProps = {},
  nextButtonProps = {},
  backButtonText = "Back",
  nextButtonText = "Continue",
  completeButtonText = "Complete",
  disableStepIndicators = false,
  renderStepIndicator,
  stepLabels = [],
  ...rest
}) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [direction, setDirection] = useState(0);
  const [isChangingStep, setIsChangingStep] = useState(false);
  const stepsArray = Children.toArray(children);
  const totalSteps = stepsArray.length;
  const isCompleted = currentStep > totalSteps;
  const isLastStep = currentStep === totalSteps;

  const updateStep = newStep => {
    setCurrentStep(newStep);
    if (newStep > totalSteps) onFinalStepCompleted();
    else onStepChange(newStep);
  };

  const requestStep = async (newStep, newDirection) => {
    if (isChangingStep) return;
    setIsChangingStep(true);
    try {
      const canChange = await onBeforeStepChange(currentStep, newStep);
      if (canChange === false) return;
      setDirection(newDirection);
      updateStep(newStep);
    } finally {
      setIsChangingStep(false);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) requestStep(currentStep - 1, -1);
  };

  const handleNext = () => {
    if (!isLastStep) requestStep(currentStep + 1, 1);
  };

  const handleComplete = () => requestStep(totalSteps + 1, 1);
  const { disabled: nextButtonDisabled, ...nextButtonRest } = nextButtonProps;

  return (
    <div className="outer-container" {...rest}>
      <div className={`step-circle-container ${stepCircleContainerClassName}`}>
        <div className={`step-indicator-row ${stepContainerClassName}`}>
          {stepsArray.map((_, index) => {
            const stepNumber = index + 1;
            const isNotLastStep = index < totalSteps - 1;
            return (
              <React.Fragment key={stepNumber}>
                {renderStepIndicator ? (
                  renderStepIndicator({
                    step: stepNumber,
                    currentStep,
                    label: stepLabels[index],
                    onStepClick: clicked => requestStep(clicked, clicked > currentStep ? 1 : -1),
                  })
                ) : (
                  <StepIndicator
                    step={stepNumber}
                    label={stepLabels[index]}
                    disableStepIndicators={disableStepIndicators}
                    currentStep={currentStep}
                    onClickStep={clicked => requestStep(clicked, clicked > currentStep ? 1 : -1)}
                  />
                )}
                {isNotLastStep && <StepConnector isComplete={currentStep > stepNumber} />}
              </React.Fragment>
            );
          })}
        </div>

        <StepContentWrapper
          isCompleted={isCompleted}
          currentStep={currentStep}
          direction={direction}
          className={`step-content-default ${contentClassName}`}
        >
          {stepsArray[currentStep - 1]}
        </StepContentWrapper>

        {!isCompleted && (
          <div className={`footer-container ${footerClassName}`}>
            <div className={`footer-nav ${currentStep !== 1 ? "spread" : "end"}`}>
              {currentStep !== 1 && (
                <button type="button" onClick={handleBack} className="back-button" {...backButtonProps}>
                  {backButtonText}
                </button>
              )}
              <button
                type="button"
                onClick={isLastStep ? handleComplete : handleNext}
                className="next-button"
                disabled={isChangingStep || nextButtonDisabled}
                {...nextButtonRest}
              >
                {isLastStep ? completeButtonText : nextButtonText}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepContentWrapper({ isCompleted, currentStep, direction, children, className }) {
  const [parentHeight, setParentHeight] = useState(0);

  return (
    <motion.div
      className={className}
      style={{ position: "relative", overflow: "hidden" }}
      animate={{ height: isCompleted ? 0 : parentHeight }}
      transition={{ type: "spring", duration: 0.4 }}
    >
      <AnimatePresence initial={false} mode="sync" custom={direction}>
        {!isCompleted && (
          <SlideTransition key={currentStep} direction={direction} onHeightReady={setParentHeight}>
            {children}
          </SlideTransition>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function SlideTransition({ children, direction, onHeightReady }) {
  const containerRef = useRef(null);

  useLayoutEffect(() => {
    if (containerRef.current) onHeightReady(containerRef.current.offsetHeight);
  }, [children, onHeightReady]);

  return (
    <motion.div
      ref={containerRef}
      custom={direction}
      variants={stepVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.4 }}
      style={{ position: "absolute", left: 0, right: 0, top: 0 }}
    >
      {children}
    </motion.div>
  );
}

const stepVariants = {
  enter: direction => ({ x: direction >= 0 ? "-100%" : "100%", opacity: 0 }),
  center: { x: "0%", opacity: 1 },
  exit: direction => ({ x: direction >= 0 ? "50%" : "-50%", opacity: 0 }),
};

export function Step({ children }) {
  return <div className="step-default">{children}</div>;
}

function StepIndicator({ step, label, currentStep, onClickStep, disableStepIndicators }) {
  const status = currentStep === step ? "active" : currentStep < step ? "inactive" : "complete";

  return (
    <button
      type="button"
      onClick={() => step !== currentStep && !disableStepIndicators && onClickStep(step)}
      className={`step-indicator tap-target ${status}`}
      disabled={disableStepIndicators}
      aria-label={`${label || `Step ${step}`}${status === "active" ? ", current step" : ""}`}
    >
      <motion.span
        variants={{
          inactive: { scale: 1, backgroundColor: "#111b3f", color: "#7890ba" },
          active: { scale: 1, backgroundColor: "#6eaeff", color: "#06102f" },
          complete: { scale: 1, backgroundColor: "#6eaeff", color: "#06102f" },
        }}
        transition={{ duration: 0.3 }}
        animate={status}
        initial={false}
        className="step-indicator-inner"
      >
        {status === "complete" ? <CheckIcon className="check-icon" /> : <span className="step-number">{step}</span>}
      </motion.span>
      {label && <span className="step-label">{label}</span>}
    </button>
  );
}

function StepConnector({ isComplete }) {
  return (
    <div className="step-connector">
      <motion.div
        className="step-connector-inner"
        variants={{
          incomplete: { width: 0, backgroundColor: "transparent" },
          complete: { width: "100%", backgroundColor: "#6eaeff" },
        }}
        initial={false}
        animate={isComplete ? "complete" : "incomplete"}
        transition={{ duration: 0.4 }}
      />
    </div>
  );
}

function CheckIcon(props) {
  return (
    <svg {...props} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <motion.path
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.1, type: "tween", ease: "easeOut", duration: 0.3 }}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}
