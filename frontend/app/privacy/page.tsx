import type { Metadata } from 'next'
import LegalLayout from '../components/LegalLayout'

export const metadata: Metadata = { title: 'Privacy Policy — Loop GPT' }

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated="August 3, 2026">
      <p>
        Loop GPT (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) is committed to protecting your privacy. This Privacy
        Policy explains how we collect, use, disclose, and safeguard your information when you
        use our service at <strong>loopgpt.ai</strong> (the &ldquo;Service&rdquo;).
      </p>

      <h2>1. Information We Collect</h2>

      <h3>Information you provide</h3>
      <ul>
        <li><strong>Account data</strong> — name, email address, and password when you register.</li>
        <li><strong>OAuth data</strong> — public profile information (name, email, avatar) from Google or GitHub when you sign in with those providers.</li>
        <li><strong>Conversation content</strong> — messages, uploaded images, and files you send through the Service.</li>
        <li><strong>Payment data</strong> — billing details processed by our payment provider (Stripe). We never store raw card numbers.</li>
      </ul>

      <h3>Information collected automatically</h3>
      <ul>
        <li><strong>Usage data</strong> — pages visited, features used, session duration, and interaction events.</li>
        <li><strong>Log data</strong> — IP address, browser type, device identifiers, and timestamps.</li>
        <li><strong>Cookies</strong> — session tokens and preference cookies. See our <a href="/cookies">Cookie Policy</a> for details.</li>
      </ul>

      <h2>2. How We Use Your Information</h2>
      <p>We use your information to:</p>
      <ul>
        <li>Provide, operate, and improve the Service.</li>
        <li>Authenticate your identity and maintain your account.</li>
        <li>Process AI inference requests on your behalf.</li>
        <li>Send transactional emails (password resets, billing receipts).</li>
        <li>Detect and prevent fraud, abuse, or policy violations.</li>
        <li>Comply with legal obligations.</li>
        <li>Aggregate anonymised analytics to understand how the Service is used.</li>
      </ul>
      <p>We do <strong>not</strong> sell your personal data to third parties or use your conversation content to train our AI models without your explicit consent.</p>

      <h2>3. Data Sharing</h2>
      <p>We share your data only in the following circumstances:</p>
      <ul>
        <li><strong>AI inference providers</strong> — your prompts are transmitted to third-party AI providers (e.g. Hugging Face, Together AI, fal.ai) solely to generate responses. These providers have their own privacy policies.</li>
        <li><strong>Infrastructure providers</strong> — Railway (hosting), Supabase/PostgreSQL (database), and Vercel (frontend CDN).</li>
        <li><strong>Payment processors</strong> — Stripe for billing.</li>
        <li><strong>Legal requirements</strong> — if required by law, court order, or to protect rights and safety.</li>
        <li><strong>Business transfers</strong> — in the event of a merger or acquisition, your data may be transferred as a business asset.</li>
      </ul>

      <h2>4. Data Retention</h2>
      <p>
        We retain your account data and conversation history for as long as your account is active.
        You may delete your account at any time from <a href="/account">Account Settings</a>, which
        permanently removes your personal data within 30 days. Anonymised, aggregated analytics
        data may be retained indefinitely.
      </p>

      <h2>5. Your Rights</h2>
      <p>Depending on your jurisdiction, you may have the right to:</p>
      <ul>
        <li>Access the personal data we hold about you.</li>
        <li>Correct inaccurate data.</li>
        <li>Request deletion of your data (&ldquo;right to be forgotten&rdquo;).</li>
        <li>Object to or restrict processing of your data.</li>
        <li>Data portability (receive a copy of your data in a machine-readable format).</li>
        <li>Withdraw consent at any time where processing is based on consent.</li>
      </ul>
      <p>To exercise any of these rights, email us at <a href="mailto:privacy@loopgpt.ai">privacy@loopgpt.ai</a>.</p>

      <h2>6. Security</h2>
      <p>
        We implement industry-standard safeguards including TLS encryption in transit, encrypted
        storage at rest, hashed passwords (bcrypt), and regular security reviews. No method of
        transmission over the Internet is 100% secure; we cannot guarantee absolute security.
      </p>

      <h2>7. Children&apos;s Privacy</h2>
      <p>
        The Service is not directed to children under 13 (or 16 in the EU/EEA). We do not
        knowingly collect personal data from children. If you believe a child has provided us
        data, contact us and we will delete it promptly.
      </p>

      <h2>8. International Transfers</h2>
      <p>
        Your data may be processed in countries outside your own, including the United States.
        We rely on Standard Contractual Clauses and other lawful transfer mechanisms where
        required by applicable law.
      </p>

      <h2>9. Third-Party Links</h2>
      <p>
        The Service may contain links to third-party websites. We are not responsible for the
        privacy practices of those sites and encourage you to review their policies.
      </p>

      <h2>10. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will notify you of material
        changes by email or by a prominent notice in the Service. Continued use after changes
        constitutes acceptance.
      </p>

      <h2>11. Contact Us</h2>
      <p>
        Questions about this Privacy Policy? Contact us at:<br />
        <a href="mailto:privacy@loopgpt.ai">privacy@loopgpt.ai</a>
      </p>
    </LegalLayout>
  )
}
