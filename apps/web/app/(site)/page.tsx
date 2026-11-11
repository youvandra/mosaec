import { Assets } from './_sections/Assets';
import { Faq } from './_sections/Faq';
import { Features } from './_sections/Features';
import { Hero } from './_sections/Hero';
import { HowItWorks } from './_sections/HowItWorks';
import { LivePacks } from './_sections/LivePacks';
import { Statement } from './_sections/Statement';
import { Suite } from './_sections/Suite';

export const revalidate = 30;

export default function HomePage() {
  return (
    <>
      <Hero />
      <Statement />
      <Features />
      <Suite />
      <HowItWorks />
      <LivePacks />
      <Assets />
      <Faq />
    </>
  );
}
