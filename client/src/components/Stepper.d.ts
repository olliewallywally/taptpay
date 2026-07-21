import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export type StepperProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  initialStep?: number;
  onStepChange?: (step: number) => void;
  onFinalStepCompleted?: () => void;
  onBeforeStepChange?: (currentStep: number, nextStep: number) => boolean | Promise<boolean>;
  stepCircleContainerClassName?: string;
  stepContainerClassName?: string;
  contentClassName?: string;
  footerClassName?: string;
  backButtonProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  nextButtonProps?: ButtonHTMLAttributes<HTMLButtonElement> & { "data-testid"?: string };
  backButtonText?: ReactNode;
  nextButtonText?: ReactNode;
  completeButtonText?: ReactNode;
  disableStepIndicators?: boolean;
  stepLabels?: string[];
  renderStepIndicator?: (props: {
    step: number;
    currentStep: number;
    label?: string;
    onStepClick: (step: number) => void;
  }) => ReactNode;
};

export default function Stepper(props: StepperProps): ReactNode;
export function Step(props: { children: ReactNode }): ReactNode;
