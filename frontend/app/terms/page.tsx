import type { Metadata } from 'next'
import LegalLayout from '../components/LegalLayout'

export const metadata: Metadata = { title: 'Terms of Service — Loop GPT' }

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" updated="August 3, 2026">
      <p>
        Please read these Terms of Service (&ldquo;Terms&rdquo;) carefully before using Loop GPT
        (&ldquo;Service,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). By creating an account or using the Service,
        you agree to be bound by these Terms. If you do not agree, do not use the Service.
      </p>

      <h2>1. Eligibility</h2>
      <p>
        You must be at least 13 years old (or 16 in the EU/EEA) to use the Service. By using
        the Service you represent that you meet this requirement and that all information you
        provide is accurate and complete.
      </p>

      <h2>2. Your Account</h2>
      <ul>
        <li>You are responsible for maintaining the confidentiality of your credentials.</li>
        <li>You are responsible for all activity that occurs under your account.</li>
        <li>Notify us immediately at <a href="mailto:support@loopgpt.ai">support@loopgpt.ai</a> if you suspect unauthorised access.</li>
        <li>You may not share, sell, or transfer your account to another person.</li>
        <li>You may not create more than one free account per person.</li>
      </ul>

      <h2>3. Description of Service</h2>
      <p>
        Loop GPT provides an AI-powered chat interface with agentic tool use, deep research,
        image generation, document creation, and related features (collectively, the &ldquo;Service&rdquo;).
        The Service relies on third-party AI inference providers whose outputs may occasionally
        be inaccurate, incomplete, or inappropriate. You are solely responsible for how you
        use AI-generated content.
      </p>

      <h2>4. Acceptable Use</h2>
      <p>
        Your use of the Service is governed by our <a href="/acceptable-use">Acceptable Use Policy</a>,
        which is incorporated into these Terms by reference. Violations may result in suspension
        or termination of your account.
      </p>

      <h2>5. Content You Submit</h2>
      <ul>
        <li>You retain ownership of content you submit (&ldquo;User Content&rdquo;).</li>
        <li>You grant us a limited licence to process and transmit your User Content solely to provide the Service.</li>
        <li>You represent that you have all rights necessary to submit your User Content and that it does not infringe any third party&apos;s rights.</li>
        <li>We do not use your User Content to train AI models without your explicit opt-in consent.</li>
      </ul>

      <h2>6. AI-Generated Content</h2>
      <p>
        AI-generated outputs are provided &ldquo;as is.&rdquo; We make no warranties regarding their
        accuracy, completeness, or fitness for a particular purpose. Do not rely on AI outputs
        for medical, legal, financial, or safety-critical decisions without independent
        professional verification.
      </p>

      <h2>7. Fees and Billing</h2>
      <ul>
        <li>Certain features require a paid subscription (&ldquo;Pro Plan&rdquo;).</li>
        <li>Fees are charged in advance on a monthly or annual basis.</li>
        <li>All fees are non-refundable except where required by law or at our sole discretion.</li>
        <li>We reserve the right to change pricing with 30 days&apos; notice.</li>
        <li>If your payment method fails, we may suspend access until payment is resolved.</li>
      </ul>

      <h2>8. Intellectual Property</h2>
      <p>
        The Service, including its design, software, and branding, is owned by Loop GPT and
        protected by copyright, trademark, and other laws. You may not copy, modify, distribute,
        or create derivative works from any part of the Service without our written permission.
      </p>

      <h2>9. Third-Party Services</h2>
      <p>
        The Service integrates with third-party providers including AI model providers, OAuth
        providers, and payment processors. Your use of those services is governed by their own
        terms and policies. We are not responsible for third-party services.
      </p>

      <h2>10. Disclaimers</h2>
      <p>
        THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND,
        EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS
        FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE
        WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.
      </p>

      <h2>11. Limitation of Liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, LOOP GPT SHALL NOT BE LIABLE FOR ANY INDIRECT,
        INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS,
        REVENUE, DATA, OR GOODWILL, ARISING OUT OF OR IN CONNECTION WITH THE SERVICE OR THESE
        TERMS, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. OUR TOTAL LIABILITY TO YOU
        FOR ANY CLAIMS ARISING UNDER THESE TERMS SHALL NOT EXCEED THE AMOUNT YOU PAID US IN
        THE 12 MONTHS PRECEDING THE CLAIM, OR USD $50, WHICHEVER IS GREATER.
      </p>

      <h2>12. Indemnification</h2>
      <p>
        You agree to indemnify and hold harmless Loop GPT and its officers, directors,
        employees, and agents from any claims, damages, or expenses (including reasonable
        attorneys&apos; fees) arising out of your use of the Service, your User Content, or your
        violation of these Terms.
      </p>

      <h2>13. Termination</h2>
      <p>
        We may suspend or terminate your access to the Service at any time, with or without
        cause, with or without notice. You may terminate your account at any time from
        <a href="/account">Account Settings</a>. Provisions that by their nature should
        survive termination will survive (including Sections 8, 10, 11, and 12).
      </p>

      <h2>14. Governing Law and Disputes</h2>
      <p>
        These Terms are governed by the laws of the State of Delaware, United States, without
        regard to conflict-of-law provisions. Any dispute shall be resolved by binding
        arbitration under the rules of the American Arbitration Association, except that either
        party may seek injunctive relief in a court of competent jurisdiction.
      </p>

      <h2>15. Changes to These Terms</h2>
      <p>
        We may update these Terms at any time. We will notify you of material changes by
        email or by a notice in the Service. Continued use after the effective date constitutes
        acceptance of the revised Terms.
      </p>

      <h2>16. Contact</h2>
      <p>
        Questions about these Terms? Contact us at <a href="mailto:legal@loopgpt.ai">legal@loopgpt.ai</a>.
      </p>
    </LegalLayout>
  )
}
