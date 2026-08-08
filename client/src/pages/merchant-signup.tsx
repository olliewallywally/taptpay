import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowLeft, Building2, Check, Eye, EyeOff,
  MailCheck, ShieldCheck, UserRound, Users,
} from "lucide-react";

import Stepper, { Step } from "@/components/Stepper";
import { DEFAULT_PLAN_ID, PLAN_LIST, formatPlanPrice, type PlanId } from "@shared/plans";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";
import logoImage from "@assets/IMG_6592_1755070818452.png";
import "./merchant-signup.css";

type SignupForm = {
  name: string;
  email: string;
  phone: string;
  businessName: string;
  businessType: string;
  businessAddress: string;
  nzbn: string;
  gstNumber: string;
  director: string;
  businessDescription: string;
  websiteUrl: string;
  estimatedAnnualTurnover: string;
  password: string;
  confirmPassword: string;
  planId: PlanId;
};

type FieldName = keyof SignupForm;
type FieldErrors = Partial<Record<FieldName, string>>;

const INITIAL_FORM: SignupForm = {
  name: "", email: "", phone: "", businessName: "", businessType: "",
  businessAddress: "", nzbn: "", gstNumber: "", director: "",
  businessDescription: "", websiteUrl: "", estimatedAnnualTurnover: "",
  password: "", confirmPassword: "", planId: DEFAULT_PLAN_ID,
};

const STEP_FIELDS: Record<number, FieldName[]> = {
  1: ["name", "email", "phone"],
  2: ["businessName", "businessType", "businessAddress", "nzbn", "gstNumber"],
  3: [
    "director", "businessDescription", "websiteUrl", "estimatedAnnualTurnover",
    "password", "confirmPassword",
  ],
  4: ["planId"],
  5: [],
};

const BUSINESS_TYPES = [
  ["sole-trader", "Sole trader"],
  ["limited-company", "Limited company"],
  ["partnership", "Partnership"],
  ["trust", "Trust"],
  ["charity", "Charity / non-profit"],
  ["other", "Other"],
];
const TURNOVER_RANGES = ["Under $50k", "$50k–$150k", "$150k–$500k", "$500k–$1m", "Over $1m"];
function getErrors(form: SignupForm, step: number): FieldErrors {
  const errors: FieldErrors = {};
  if (step === 1) {
    if (!form.name.trim()) errors.name = "Enter your full legal name.";
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errors.email = "Enter a valid email address.";
    if (!form.phone.trim()) errors.phone = "Enter your phone number.";
  }
  if (step === 2) {
    if (!form.businessName.trim()) errors.businessName = "Enter your legal business name.";
    if (!form.businessType) errors.businessType = "Select a business type.";
    if (!form.businessAddress.trim()) errors.businessAddress = "Enter your business address.";
  }
  if (step === 3) {
    if (!form.director.trim()) errors.director = "Enter the director or owner's legal name.";
    if (!form.businessDescription.trim()) errors.businessDescription = "Tell us briefly what the business does.";
    if (form.websiteUrl && !/^https?:\/\//i.test(form.websiteUrl)) errors.websiteUrl = "Start the website address with http:// or https://.";
    if (!form.estimatedAnnualTurnover) errors.estimatedAnnualTurnover = "Select an estimated annual turnover.";
    if (form.password.length < 8) errors.password = "Use at least 8 characters.";
    else if (!/[A-Z]/.test(form.password) || !/[a-z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      errors.password = "Include uppercase, lowercase and a number.";
    }
    if (form.confirmPassword !== form.password) errors.confirmPassword = "Passwords do not match.";
  }
  if (step === 4) {
    if (!PLAN_LIST.some(plan => plan.id === form.planId)) errors.planId = "Choose a plan to continue.";
  }
  return errors;
}

function StepHeading({ icon: Icon, eyebrow, title, description }: { icon: any; eyebrow: string; title: string; description: string }) {
  return (
    <div className="signup-step-heading">
      <div className="signup-step-icon"><Icon aria-hidden="true" /></div>
      <div>
        <p className="signup-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="signup-description">{description}</p>
      </div>
    </div>
  );
}

function Field({
  form, errors, set, name, label, optional = false, type = "text",
  placeholder, autoComplete, inputMode,
}: {
  form: SignupForm;
  errors: FieldErrors;
  set: (name: FieldName, value: string) => void;
  name: FieldName;
  label: string;
  optional?: boolean;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel" | "url" | "numeric";
}) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";
  return (
    <label className="signup-field">
      <span>{label}{optional && <em>Optional</em>}</span>
      <div className="signup-input-wrap">
        <input
          name={name}
          type={isPassword && revealed ? "text" : type}
          value={form[name]}
          onChange={event => set(name, event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          aria-invalid={!!errors[name]}
        />
        {isPassword && (
          <button type="button" className="password-toggle" onClick={() => setRevealed(value => !value)} aria-label={revealed ? "Hide password" : "Show password"}>
            {revealed ? <EyeOff /> : <Eye />}
          </button>
        )}
      </div>
      {errors[name] && <small className="signup-error">{errors[name]}</small>}
    </label>
  );
}

function SelectField({ form, errors, set, name, label, placeholder, options }: {
  form: SignupForm;
  errors: FieldErrors;
  set: (name: FieldName, value: string) => void;
  name: FieldName;
  label: string;
  placeholder: string;
  options: Array<string | string[]>;
}) {
  return (
    <label className="signup-field">
      <span>{label}</span>
      <select name={name} value={form[name]} onChange={event => set(name, event.target.value)} aria-invalid={!!errors[name]}>
        <option value="">{placeholder}</option>
        {options.map(option => {
          const [value, text] = Array.isArray(option) ? option : [option, option];
          return <option key={value} value={value}>{text}</option>;
        })}
      </select>
      {errors[name] && <small className="signup-error">{errors[name]}</small>}
    </label>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return <div className="review-row"><span>{label}</span><strong>{value || "Not provided"}</strong></div>;
}

export default function MerchantSignup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState<SignupForm>(INITIAL_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [activeStep, setActiveStep] = useState(1);

  const set = (name: FieldName, value: string) => {
    setForm(previous => ({ ...previous, [name]: value }));
    if (errors[name]) setErrors(previous => ({ ...previous, [name]: undefined }));
  };

  const pickPlan = (planId: PlanId) => {
    setForm(previous => ({ ...previous, planId }));
    setErrors(previous => ({ ...previous, planId: undefined }));
  };

  const signupMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/merchants/signup", form);
      return response.json();
    },
    onSuccess: data => {
      setLocation(`/check-email?email=${encodeURIComponent(form.email)}&id=${data.merchant.id}`);
    },
    onError: (error: unknown) => {
      const description = apiErrorMessage(error, "We couldn't create the account. Please try again.");
      toast({ title: "Signup failed", description, variant: "destructive" });
    },
  });

  const validateAndContinue = async (currentStep: number, nextStep: number) => {
    if (nextStep < currentStep) {
      setErrors({});
      return true;
    }
    const nextErrors = getErrors(form, currentStep);
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      const firstField = STEP_FIELDS[currentStep].find(field => nextErrors[field]);
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[name="${firstField}"]`)?.focus());
      return false;
    }
    setErrors({});
    if (currentStep === 5) {
      try {
        await signupMutation.mutateAsync();
      } catch {
        return false;
      }
    }
    return true;
  };

  return (
    <main className="signup-page">
      <button className="signup-page-back" onClick={() => setLocation("/")}><ArrowLeft /> Back</button>
      <div className="signup-shell">
        <div className="signup-brand-row">
          <img src={logoImage} alt="TaptPay" />
          <p>Already have an account? <button onClick={() => setLocation("/login")}>Sign in</button></p>
        </div>

        <Stepper
          initialStep={1}
          stepLabels={["Contact", "Business", "KYC & security", "Plan", "Verify"]}
          disableStepIndicators
          onStepChange={setActiveStep}
          onBeforeStepChange={validateAndContinue}
          onFinalStepCompleted={() => {}}
          backButtonText="Previous"
          nextButtonText="Next step"
          completeButtonText={signupMutation.isPending ? "Sending…" : "Verify email"}
          nextButtonProps={{ disabled: signupMutation.isPending, "data-testid": "signup-next" }}
          data-current-step={activeStep}
        >
          <Step>
            <StepHeading icon={UserRound} eyebrow="Step 1 of 5" title="Let’s start with you" description="Your main contact details for the TaptPay account." />
            <div className="signup-fields signup-fields-one">
              <Field form={form} errors={errors} set={set} name="name" label="Full name" placeholder="Your full legal name" autoComplete="name" />
              <Field form={form} errors={errors} set={set} name="email" label="Email address" type="email" inputMode="email" placeholder="you@business.co.nz" autoComplete="email" />
              <Field form={form} errors={errors} set={set} name="phone" label="Phone number" type="tel" inputMode="tel" placeholder="+64 21 000 0000" autoComplete="tel" />
            </div>
          </Step>

          <Step>
            <StepHeading icon={Building2} eyebrow="Step 2 of 5" title="Tell us about the business" description="Use the legal details registered for your business." />
            <div className="signup-fields signup-fields-two">
              <Field form={form} errors={errors} set={set} name="businessName" label="Business name" placeholder="Legal business name" autoComplete="organization" />
              <SelectField form={form} errors={errors} set={set} name="businessType" label="Business type" placeholder="Select business type" options={BUSINESS_TYPES} />
              <div className="signup-field-wide"><Field form={form} errors={errors} set={set} name="businessAddress" label="Business address" placeholder="Street, suburb, city and postcode" autoComplete="street-address" /></div>
              <Field form={form} errors={errors} set={set} name="nzbn" label="NZBN" optional placeholder="13-digit NZ Business Number" inputMode="numeric" />
              <Field form={form} errors={errors} set={set} name="gstNumber" label="GST number" optional placeholder="If GST registered" />
            </div>
          </Step>

          <Step>
            <StepHeading icon={ShieldCheck} eyebrow="Step 3 of 5" title="Verification and security" description="The remaining details needed for KYC, AML and account security." />
            <div className="signup-section-title"><ShieldCheck /> Business verification</div>
            <div className="signup-fields signup-fields-two">
              <Field form={form} errors={errors} set={set} name="director" label="Director / owner" placeholder="Full legal name as shown on ID" />
              <SelectField form={form} errors={errors} set={set} name="estimatedAnnualTurnover" label="Estimated annual card turnover" placeholder="Select a range" options={TURNOVER_RANGES} />
              <label className="signup-field signup-field-wide">
                <span>Business description</span>
                <textarea name="businessDescription" value={form.businessDescription} onChange={event => set("businessDescription", event.target.value)} placeholder="Briefly describe what your business does" aria-invalid={!!errors.businessDescription} />
                {errors.businessDescription && <small className="signup-error">{errors.businessDescription}</small>}
              </label>
              <div className="signup-field-wide"><Field form={form} errors={errors} set={set} name="websiteUrl" label="Website" optional type="url" inputMode="url" placeholder="https://yourbusiness.co.nz" autoComplete="url" /></div>
            </div>

            <div className="signup-section-title"><UserRound /> Account security</div>
            <div className="signup-fields signup-fields-two">
              <Field form={form} errors={errors} set={set} name="password" label="Create password" type="password" placeholder="8+ characters" autoComplete="new-password" />
              <Field form={form} errors={errors} set={set} name="confirmPassword" label="Confirm password" type="password" placeholder="Repeat password" autoComplete="new-password" />
            </div>
          </Step>

          <Step>
            <StepHeading icon={Users} eyebrow="Step 4 of 5" title="Choose your plan" description="Every plan includes the full product — the only difference is how many people can log in." />
            <div className="plan-grid" role="radiogroup" aria-label="Subscription plan">
              {PLAN_LIST.map(plan => {
                const selected = form.planId === plan.id;
                return (
                  <button
                    type="button"
                    key={plan.id}
                    role="radio"
                    aria-checked={selected}
                    className={`plan-card${selected ? " plan-card-selected" : ""}`}
                    onClick={() => pickPlan(plan.id)}
                    data-testid={`signup-plan-${plan.id}`}
                  >
                    {plan.popular && <span className="plan-badge">Most popular</span>}
                    <span className="plan-name">{plan.name}</span>
                    <span className="plan-price">
                      {formatPlanPrice(plan.priceCents)}<em>/mo</em>
                    </span>
                    <span className="plan-blurb">{plan.blurb}</span>
                    <span className="plan-check" aria-hidden="true">{selected && <Check />}</span>
                  </button>
                );
              })}
            </div>
            {errors.planId && <small className="signup-error">{errors.planId}</small>}
            <p className="plan-note">
              No per-transaction fees and no lock-in contract — cancel any time and keep
              access until the end of the period you have paid for. Need more than 10 logins?{" "}
              <a href="/#tp-contact">Talk to us about Enterprise.</a>
            </p>
          </Step>

          <Step>
            <StepHeading icon={MailCheck} eyebrow="Step 5 of 5" title="Review and verify" description="Check the key details below. We’ll email you a link to verify and submit the application." />
            <div className="review-grid">
              <section>
                <h2>Contact</h2>
                <ReviewRow label="Full name" value={form.name} />
                <ReviewRow label="Email" value={form.email} />
                <ReviewRow label="Phone" value={form.phone} />
              </section>
              <section>
                <h2>Business</h2>
                <ReviewRow label="Business name" value={form.businessName} />
                <ReviewRow label="Business type" value={BUSINESS_TYPES.find(([value]) => value === form.businessType)?.[1] || form.businessType} />
                <ReviewRow label="Address" value={form.businessAddress} />
              </section>
              <section>
                <h2>Plan</h2>
                {(() => {
                  const plan = PLAN_LIST.find(p => p.id === form.planId);
                  return plan ? (
                    <>
                      <ReviewRow label="Plan" value={plan.name} />
                      <ReviewRow label="Price" value={`${formatPlanPrice(plan.priceCents)} / month`} />
                      <ReviewRow label="Logins" value={String(plan.seats)} />
                    </>
                  ) : null;
                })()}
              </section>
            </div>
            <div className="verify-notice">
              <MailCheck />
              <p><strong>Ready to verify?</strong><span>The button below creates your pending account and sends the verification email to {form.email}.</span></p>
            </div>
            <p className="signup-consent">By continuing, you confirm the information is accurate and authorise TaptPay and Windcave to use it for KYC, AML and payment processing under our <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</p>
          </Step>
        </Stepper>
      </div>
    </main>
  );
}
