import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Repair Manager",
  description: "How Repair Manager collects, uses, and protects your personal data.",
};

const EFFECTIVE_DATE = "1 May 2025";
const COMPANY = "Repair Manager";
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "support@example.com";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-white">
      {/* Nav */}
      <header className="border-b border-white/8 px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-base font-bold tracking-tight text-white">Repair</span>
            <span className="rounded bg-[#D4AF37]/15 px-1.5 py-0.5 text-[11px] font-bold text-[#D4AF37]">Manager</span>
          </Link>
          <Link href="/register" className="text-sm text-white/50 transition-colors hover:text-white">
            Get started →
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <div className="mb-8">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#D4AF37]/70">Legal</p>
          <h1 className="mb-2 text-3xl font-bold text-white">Privacy Policy</h1>
          <p className="text-sm text-white/40">Effective date: {EFFECTIVE_DATE}</p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-white/65">

          <section>
            <p>
              {COMPANY} (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) operates the Repair Manager platform.
              This Privacy Policy explains what information we collect, how we use it, and your rights regarding it.
              By using the Platform you agree to the practices described here.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-white">1. Information We Collect</h2>

            <h3 className="mb-2 text-sm font-semibold text-white/80">1.1 Account and workspace data</h3>
            <p className="mb-4">
              When you register, we collect your name, email address, and password (stored as a secure hash).
              When you create a workspace we store the workspace name and the subscription plan you choose.
            </p>

            <h3 className="mb-2 text-sm font-semibold text-white/80">1.2 Data you enter on behalf of your clients</h3>
            <p className="mb-4">
              The Platform stores the repair job data you create, including client names, phone numbers, email
              addresses, device information, diagnosis notes, invoices, and photos.
              This data belongs to you — we process it on your behalf as a data processor.
            </p>

            <h3 className="mb-2 text-sm font-semibold text-white/80">1.3 Usage and technical data</h3>
            <p>
              We collect standard server logs (IP addresses, request timestamps, browser type) and aggregate
              usage metrics (pages visited, feature usage) to operate and improve the Platform.
              We do not use third-party analytics trackers on authenticated pages.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-white">2. How We Use Your Information</h2>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>To create and manage your workspace and user accounts.</li>
              <li>To process subscription payments via Flutterwave.</li>
              <li>To send transactional emails (account confirmation, trial expiry notices, payment receipts).</li>
              <li>To provide customer support when you contact us.</li>
              <li>To detect and prevent fraud, abuse, and security incidents.</li>
              <li>To comply with applicable legal obligations.</li>
            </ul>
            <p className="mt-3">
              We do not use your data for advertising, and we do not sell your data to any third party.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-white">3. Data Sharing and Third-Party Processors</h2>
            <p className="mb-3">
              We share data only with the following categories of third-party processors, under appropriate
              data processing agreements:
            </p>
            <div className="overflow-hidden rounded-xl border border-white/8">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8 bg-white/[0.03]">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-white/50">Processor</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-white/50">Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Flutterwave", "Payment processing for paid subscriptions"],
                    ["Resend", "Transactional email delivery (billing, trial notices)"],
                    ["Hosting provider", "Cloud infrastructure and database hosting"],
                  ].map(([p, d], i) => (
                    <tr key={p} className={i > 0 ? "border-t border-white/6" : ""}>
                      <td className="px-4 py-2.5 font-medium text-white/70">{p}</td>
                      <td className="px-4 py-2.5 text-white/50">{d}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3">
              We may also disclose information when required by law or to protect our legal rights.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-white">4. Data Retention</h2>
            <p className="mb-3">
              We retain your account and workspace data for as long as your workspace is active.
              If you delete your workspace, we will remove your data within 30 days, except where we are
              required to retain it for legal or regulatory purposes.
            </p>
            <p>
              Server logs are retained for up to 90 days. Aggregated, anonymised usage metrics may be
              retained indefinitely.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-white">5. Data Security</h2>
            <p>
              We use industry-standard measures to protect your data, including encryption in transit (TLS),
              hashed passwords, and access controls that restrict data to authorised personnel.
              No system is completely secure; we will notify you promptly in the event of a data breach
              that affects your personal data.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-white">6. Tenant Isolation</h2>
            <p>
              Each workspace is logically isolated at the database level — all records are scoped to your
              organisation and cannot be accessed by users in other workspaces.
              Within your workspace, data visibility is controlled by the roles you assign to your team members.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-white">7. Cookies</h2>
            <p>
              We use a single session cookie to maintain your authenticated session.
              We do not use advertising cookies or third-party tracking cookies.
              Disabling cookies in your browser will prevent you from logging in.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-white">8. Your Rights</h2>
            <p className="mb-3">Subject to applicable law, you have the right to:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li><strong className="text-white/80">Access</strong> — request a copy of personal data we hold about you.</li>
              <li><strong className="text-white/80">Correction</strong> — request that inaccurate data be corrected.</li>
              <li><strong className="text-white/80">Erasure</strong> — request deletion of your personal data (subject to legal obligations).</li>
              <li><strong className="text-white/80">Portability</strong> — receive your data in a machine-readable format.</li>
              <li><strong className="text-white/80">Objection</strong> — object to certain processing activities.</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, contact us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#D4AF37] hover:underline">{CONTACT_EMAIL}</a>.
              We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-white">9. Children&rsquo;s Privacy</h2>
            <p>
              The Platform is not directed at children under 18 years of age.
              We do not knowingly collect personal information from children.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-white">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes
              via email or a notice within the Platform at least 14 days before they take effect.
              The &ldquo;Effective date&rdquo; at the top of this page reflects when the current version took effect.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-white">11. Contact</h2>
            <p>
              For privacy-related questions or to exercise your rights, contact us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#D4AF37] hover:underline">{CONTACT_EMAIL}</a>.
            </p>
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/8 px-4 py-6 md:px-6">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] text-white/25">© {new Date().getFullYear()} {COMPANY}</p>
          <nav className="flex gap-4">
            <Link href="/" className="text-[12px] text-white/35 transition-colors hover:text-white">Home</Link>
            <Link href="/terms" className="text-[12px] text-white/35 transition-colors hover:text-white">Terms of Service</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
