import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — BusinessOS",
  description: "Terms and conditions governing use of the BusinessOS platform.",
};

const EFFECTIVE_DATE = "1 May 2025";
const COMPANY = "BusinessOS";
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "support@example.com";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#020408] text-white">
      {/* Nav */}
      <header className="border-b border-white/8 px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-base font-bold tracking-tight text-white">Business</span>
            <span className="rounded bg-[#4F8EF7]/15 px-1.5 py-0.5 text-[13px] font-bold text-[#4F8EF7]">OS</span>
          </Link>
          <Link href="/register" className="text-sm text-white/50 transition-colors hover:text-white">
            Get started →
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <div className="mb-8">
          <p className="mb-2 text-[13px] font-bold uppercase tracking-[0.18em] text-[#4F8EF7]/70">Legal</p>
          <h1 className="mb-2 text-3xl font-bold text-white">Terms of Service</h1>
          <p className="text-sm text-white/40">Effective date: {EFFECTIVE_DATE}</p>
        </div>

        <div className="prose-legal space-y-8 text-sm leading-relaxed text-white/65">

          <section>
            <p>
              These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the BusinessOS software platform
              (&ldquo;Platform&rdquo;) operated by {COMPANY} (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;).
              By creating a workspace or using the Platform you agree to be bound by these Terms.
              If you do not agree, do not use the Platform.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-white">1. Accounts and Workspaces</h2>
            <p className="mb-3">
              Each organisation registers a single workspace. You are responsible for all activity that occurs
              under your workspace, including activity by team members you invite. You must provide accurate
              registration information and keep it up to date.
            </p>
            <p>
              You are responsible for maintaining the confidentiality of your login credentials.
              Notify us immediately at <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#4F8EF7] hover:underline">{CONTACT_EMAIL}</a> if
              you suspect unauthorised access to your account.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-white">2. Acceptable Use</h2>
            <p className="mb-3">You agree not to:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Use the Platform for any unlawful purpose or in violation of any applicable law or regulation.</li>
              <li>Attempt to gain unauthorised access to any part of the Platform or its infrastructure.</li>
              <li>Upload or transmit viruses, malware, or any other harmful code.</li>
              <li>Interfere with or disrupt the integrity or performance of the Platform.</li>
              <li>Scrape, crawl, or systematically extract data from the Platform without our written permission.</li>
              <li>Resell or sublicense access to the Platform without our written consent.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-white">3. Subscription, Billing, and Cancellation</h2>
            <p className="mb-3">
              The Starter plan is free. Paid plans (Growth and Enterprise) are billed monthly in Ugandan Shillings (UGX)
              via Pesapal. All paid plans begin with a 14-day free trial.
            </p>
            <p className="mb-3">
              Subscription charges are non-refundable except where required by applicable law.
              If you cancel a paid subscription, your workspace remains on the paid plan until the end of the current
              billing period, after which it reverts to the Starter plan limits.
            </p>
            <p>
              We reserve the right to change pricing with 30 days&rsquo; notice communicated to the email address
              registered to your workspace administrator.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-white">4. Data Ownership</h2>
            <p className="mb-3">
              You retain full ownership of all data you input into the Platform (&ldquo;Your Data&rdquo;),
              including client records, job files, and inventory information.
              We do not claim any intellectual property rights over Your Data.
            </p>
            <p>
              We process Your Data solely to provide and improve the Platform as described in our{" "}
              <Link href="/privacy" className="text-[#4F8EF7] hover:underline">Privacy Policy</Link>.
              We will not sell Your Data to third parties.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-white">5. Data Isolation and Confidentiality</h2>
            <p>
              Each workspace is logically isolated. Users in one workspace cannot access data belonging to another
              workspace. Within a workspace, access is controlled by the roles you assign to your team members.
              We implement reasonable technical measures to enforce this isolation, but you are responsible for
              assigning appropriate roles and managing access within your workspace.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-white">6. Service Availability</h2>
            <p className="mb-3">
              We aim to keep the Platform available at all times but do not guarantee uninterrupted access.
              We may perform maintenance that temporarily makes the Platform unavailable; we will endeavour to
              schedule this outside peak hours and provide advance notice where possible.
            </p>
            <p>
              The Platform is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind,
              express or implied, including warranties of merchantability, fitness for a particular purpose,
              or non-infringement.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-white">7. Limitation of Liability</h2>
            <p className="mb-3">
              To the maximum extent permitted by applicable law, {COMPANY} shall not be liable for any indirect,
              incidental, special, consequential, or punitive damages, including loss of profits, data, or goodwill,
              arising from your use of or inability to use the Platform.
            </p>
            <p>
              Our total liability to you for any claim arising from these Terms or your use of the Platform
              shall not exceed the amount you paid us in the three months immediately preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-white">8. Termination</h2>
            <p className="mb-3">
              You may delete your workspace at any time from your workspace settings.
              We may suspend or terminate your access if you materially breach these Terms and fail to remedy the
              breach within 7 days of written notice.
            </p>
            <p>
              Upon termination, you may request an export of Your Data within 30 days. After that period
              we may delete Your Data from our systems.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-white">9. Modifications to the Terms</h2>
            <p>
              We may update these Terms from time to time. We will notify you of material changes via email
              or a notice within the Platform at least 14 days before they take effect.
              Continued use of the Platform after the effective date constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-white">10. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the Republic of Uganda.
              Any disputes shall be subject to the exclusive jurisdiction of the courts of Kampala, Uganda.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-white">11. Contact</h2>
            <p>
              Questions about these Terms? Contact us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#4F8EF7] hover:underline">{CONTACT_EMAIL}</a>.
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
            <Link href="/privacy" className="text-[12px] text-white/35 transition-colors hover:text-white">Privacy Policy</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
