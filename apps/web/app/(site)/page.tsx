import { Assets } from './_sections/Assets';
import { Faq } from './_sections/Faq';
import { Features } from './_sections/Features';
import { Hero } from './_sections/Hero';
import { HowItWorks } from './_sections/HowItWorks';
import { LivePacks } from './_sections/LivePacks';
import { Loss } from './_sections/Loss';
import { Statement } from './_sections/Statement';
import { Suite } from './_sections/Suite';
import { TwoRights } from './_sections/TwoRights';

export const revalidate = 30;

export default function HomePage() {
  return (
    <>
      <Hero />
      <Statement />
      <Features />
      <Suite />
      <Loss />
      <HowItWorks />
      <TwoRights />
      <LivePacks />
      <Assets />
      <Faq />
    </>
  );
}
