import { useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

function TermsOfService() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Terms of Service</CardTitle>
          <p className="text-sm text-muted-foreground">Effective Date: February 2026</p>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none space-y-6">
          <section>
            <h2 className="text-lg font-semibold mb-2">1. Service Description</h2>
            <p className="text-muted-foreground">
              TaptPay (operated via taptpay.co.nz) is a New Zealand-based payment processing platform that enables merchants to accept card payments, manage transactions, and streamline their payment operations. Our services include payment terminal solutions, transaction processing, reporting, and related merchant tools.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">2. Account Registration</h2>
            <p className="text-muted-foreground">
              To use TaptPay's services, you must register for a merchant account. You agree to provide accurate, current, and complete information during the registration process and to update such information as necessary. You are responsible for maintaining the confidentiality of your account credentials. You must be at least 18 years of age and have the legal authority to enter into this agreement on behalf of your business. TaptPay reserves the right to verify your identity and business details before activating your account.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">3. Payment Processing</h2>
            <p className="text-muted-foreground">
              TaptPay facilitates payment processing between merchants and their customers. We process card transactions through authorised payment gateways and banking partners. Funds from completed transactions will be settled to your nominated bank account in accordance with the settlement schedule outlined in your merchant agreement. TaptPay does not guarantee the completion of any transaction and reserves the right to decline, hold, or reverse transactions where fraud, chargebacks, or policy violations are suspected.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">4. Fees</h2>
            <p className="text-muted-foreground">
              Transaction fees apply to all payments processed through TaptPay. The specific fee structure, including per-transaction rates and any applicable monthly charges, is outlined in your individual merchant agreement. TaptPay reserves the right to modify fees with reasonable notice. Any outstanding fees will be deducted from your settlement amounts or charged to your nominated payment method.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">5. User Responsibilities</h2>
            <p className="text-muted-foreground">
              As a merchant using TaptPay, you agree to: use the service only for lawful business purposes; comply with all applicable laws, regulations, and card network rules; not process fraudulent or unauthorised transactions; maintain appropriate records of all transactions; respond promptly to any chargeback or dispute enquiries; ensure your products and services comply with New Zealand consumer protection laws; and promptly report any suspected security breaches or unauthorised access to your account.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">6. Data Handling</h2>
            <p className="text-muted-foreground">
              TaptPay collects and processes data necessary for providing payment services. All cardholder data is handled in accordance with Payment Card Industry Data Security Standards (PCI DSS). We do not store full card numbers on our systems. For full details on how we handle your data, please refer to our Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">7. Service Availability</h2>
            <p className="text-muted-foreground">
              TaptPay strives to maintain high availability of its services. However, we do not guarantee uninterrupted or error-free operation. The service may be temporarily unavailable due to scheduled maintenance, system upgrades, or circumstances beyond our reasonable control. We will endeavour to provide advance notice of any planned downtime where practicable.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">8. Limitation of Liability</h2>
            <p className="text-muted-foreground">
              To the maximum extent permitted by New Zealand law, TaptPay shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, revenue, data, or business opportunities arising from or related to your use of our services. Our total liability for any claim arising under these terms shall not exceed the total fees paid by you to TaptPay in the twelve months preceding the claim. Nothing in these terms excludes or limits liability that cannot be excluded or limited under New Zealand law, including the Consumer Guarantees Act 1993.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">9. Termination</h2>
            <p className="text-muted-foreground">
              Either party may terminate this agreement by providing written notice. TaptPay may suspend or terminate your account immediately if you breach these terms, engage in fraudulent activity, or if required by law or card network rules. Upon termination, any pending settlements will be processed subject to applicable hold periods. You remain responsible for any fees, chargebacks, or liabilities incurred prior to termination.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">10. Governing Law</h2>
            <p className="text-muted-foreground">
              These Terms of Service are governed by and construed in accordance with the laws of New Zealand. Any disputes arising from or relating to these terms shall be subject to the exclusive jurisdiction of the courts of New Zealand.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">11. Contact</h2>
            <p className="text-muted-foreground">
              If you have any questions about these Terms of Service, please contact us at{" "}
              <a href="mailto:support@taptpay.co.nz" className="text-primary hover:underline">
                support@taptpay.co.nz
              </a>.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}

function PrivacyPolicy() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Privacy Policy</CardTitle>
          <p className="text-sm text-muted-foreground">Effective Date: February 2026</p>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none space-y-6">
          <section>
            <h2 className="text-lg font-semibold mb-2">1. Information We Collect</h2>
            <p className="text-muted-foreground">
              We collect the following types of information to provide and improve our payment processing services:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li><strong>Personal Information:</strong> Name, email address, phone number, and identification documents provided during account registration.</li>
              <li><strong>Business Information:</strong> Business name, registration number, address, bank account details, and business type.</li>
              <li><strong>Transaction Data:</strong> Payment amounts, dates, cardholder details (masked), transaction status, and settlement records.</li>
              <li><strong>Technical Data:</strong> IP address, browser type, device information, and usage patterns when accessing our platform.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">2. How We Use Your Data</h2>
            <p className="text-muted-foreground">We use the information we collect to:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Process and settle payment transactions</li>
              <li>Verify merchant identity and prevent fraud</li>
              <li>Provide customer support and resolve disputes</li>
              <li>Generate transaction reports and analytics</li>
              <li>Comply with legal and regulatory obligations</li>
              <li>Improve our services and develop new features</li>
              <li>Communicate important service updates and changes</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">3. Data Sharing</h2>
            <p className="text-muted-foreground">
              We may share your information with the following third parties as necessary to provide our services:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li><strong>Payment Processors:</strong> We work with payment gateway providers such as Windcave to process card transactions securely.</li>
              <li><strong>Banking Partners:</strong> Your bank account details are shared with our banking partners to facilitate fund settlements.</li>
              <li><strong>Card Networks:</strong> Transaction data is shared with card networks (Visa, Mastercard) as required for payment processing.</li>
              <li><strong>Regulatory Authorities:</strong> We may disclose information where required by law, regulation, or court order.</li>
              <li><strong>Service Providers:</strong> Trusted third parties who assist us in operating our platform, subject to confidentiality obligations.</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              We do not sell your personal information to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">4. Data Security</h2>
            <p className="text-muted-foreground">
              We implement robust security measures to protect your information, including encryption of data in transit and at rest, secure access controls and authentication, regular security assessments and monitoring, PCI DSS compliance for cardholder data, and secure data storage within protected infrastructure. While we take all reasonable steps to protect your data, no method of electronic storage or transmission is completely secure.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">5. Data Retention</h2>
            <p className="text-muted-foreground">
              We retain your personal and transaction data for as long as necessary to provide our services, comply with legal obligations, and resolve disputes. Transaction records are retained for a minimum of seven years in accordance with New Zealand tax and financial record-keeping requirements. Upon account closure, we will retain only the data required by law and securely delete or anonymise the remainder.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">6. Your Rights Under the NZ Privacy Act 2020</h2>
            <p className="text-muted-foreground">
              Under the New Zealand Privacy Act 2020, you have the right to:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Request access to the personal information we hold about you</li>
              <li>Request correction of any inaccurate or incomplete information</li>
              <li>Request deletion of your personal information, subject to legal retention requirements</li>
              <li>Complain to the Office of the Privacy Commissioner if you believe your privacy has been breached</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              To exercise any of these rights, please contact us at{" "}
              <a href="mailto:privacy@taptpay.co.nz" className="text-primary hover:underline">
                privacy@taptpay.co.nz
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">7. Cookies</h2>
            <p className="text-muted-foreground">
              TaptPay uses cookies and similar technologies to maintain your session, remember your preferences, and analyse platform usage. Essential cookies are required for the platform to function correctly. You can manage cookie preferences through your browser settings, though disabling certain cookies may affect platform functionality.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">8. Contact for Privacy Enquiries</h2>
            <p className="text-muted-foreground">
              If you have any questions or concerns about this Privacy Policy or our data handling practices, please contact our Privacy Officer at{" "}
              <a href="mailto:privacy@taptpay.co.nz" className="text-primary hover:underline">
                privacy@taptpay.co.nz
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">9. Changes to This Policy</h2>
            <p className="text-muted-foreground">
              We may update this Privacy Policy from time to time to reflect changes in our practices, technology, or legal requirements. We will notify you of any material changes by posting the updated policy on our website and, where appropriate, by email. Your continued use of TaptPay after any changes constitutes your acceptance of the updated policy.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LegalPage() {
  const [location] = useLocation();
  const isTerms = location === "/terms";

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>

        {isTerms ? <TermsOfService /> : <PrivacyPolicy />}

        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>
            {isTerms ? (
              <>
                See also our{" "}
                <Link href="/privacy" className="text-primary hover:underline">
                  Privacy Policy
                </Link>
              </>
            ) : (
              <>
                See also our{" "}
                <Link href="/terms" className="text-primary hover:underline">
                  Terms of Service
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}