import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { apiRequest } from "@/lib/queryClient";
import MerchantSignup from "./merchant-signup";

const setLocation = jest.fn();

jest.mock("wouter", () => ({
  useLocation: () => ["/signup", setLocation],
}));

jest.mock("@/lib/queryClient", () => ({
  apiRequest: jest.fn(),
}));

jest.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock("@/components/Stepper", () => {
  const React = require("react");

  const Step = ({ children }: { children: React.ReactNode }) => <>{children}</>;

  const Stepper = ({
    children,
    initialStep = 1,
    onStepChange,
    onBeforeStepChange,
    nextButtonProps,
    backButtonProps,
    dataCurrentStep,
  }: any) => {
    const steps = React.Children.toArray(children);
    const [step, setStep] = React.useState(initialStep);

    React.useEffect(() => {
      onStepChange?.(step);
    }, [onStepChange, step]);

    const go = async (nextStep: number) => {
      const allowed = await (onBeforeStepChange ? onBeforeStepChange(step, nextStep) : true);
      if (allowed && nextStep !== step) setStep(nextStep);
    };

    return (
      <div data-current-step={dataCurrentStep ?? step}>
        {steps[step - 1]}
        <button
          type="button"
          data-testid="signup-prev"
          {...backButtonProps}
          onClick={() => void go(Math.max(1, step - 1))}
        >
          Previous
        </button>
        <button
          type="button"
          data-testid="signup-next"
          {...nextButtonProps}
          onClick={() => void go(step < steps.length ? step + 1 : step)}
        >
          Next step
        </button>
      </div>
    );
  };

  return { __esModule: true, default: Stepper, Step };
});

describe("merchant signup plan selection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiRequest as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ merchant: { id: 42 } }),
    });
  });

  it("renders catalogue prices and sends the selected plan with signup", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const user = userEvent.setup();
    const clickNext = async () => {
      const button = screen.getByTestId("signup-next");
      await waitFor(() => expect(button).toBeEnabled());
      await user.click(button);
    };

    render(
      <QueryClientProvider client={queryClient}>
        <MerchantSignup />
      </QueryClientProvider>,
    );

    await user.type(screen.getByLabelText("Full name"), "Jamie Smith");
    await user.type(screen.getByLabelText("Email address"), "jamie@example.test");
    await user.type(screen.getByLabelText("Phone number"), "0210000000");
    await clickNext();

    await user.type(await screen.findByLabelText("Business name"), "Kauri Studio");
    await user.selectOptions(screen.getByLabelText("Business type"), "limited-company");
    await user.type(screen.getByLabelText("Business address"), "1 Kauri Road, Auckland");
    await clickNext();

    await user.type(await screen.findByLabelText("Director / owner"), "Jamie Smith");
    await user.selectOptions(screen.getByLabelText("Estimated annual card turnover"), "$150k–$500k");
    await user.type(screen.getByLabelText("Business description"), "Independent design studio");
    await user.type(screen.getByLabelText("Create password"), "StrongPass1");
    await user.type(screen.getByLabelText("Confirm password"), "StrongPass1");
    await clickNext();

    const team = await screen.findByTestId("signup-plan-team");
    expect(screen.getByTestId("signup-plan-solo")).toHaveTextContent("$7.99");
    expect(team).toHaveTextContent("$8.99");
    expect(screen.getByTestId("signup-plan-crew")).toHaveTextContent("$12.99");
    await user.click(team);
    expect(team).toHaveAttribute("aria-checked", "true");
    await clickNext();

    expect(await screen.findByText("$8.99 / month")).toBeInTheDocument();
    await clickNext();

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith(
        "POST",
        "/api/merchants/signup",
        expect.objectContaining({ planId: "team" }),
      );
    });
    expect(setLocation).toHaveBeenCalledWith("/check-email?email=jamie%40example.test&id=42");
  });
});
