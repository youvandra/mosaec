import { Assets } from './_sections/Assets';
import { Faq } from './_sections/Faq';
import { Hero } from './_sections/Hero';
import { HowItWorks } from './_sections/HowItWorks';
import { LivePacks } from './_sections/LivePacks';
import { Loss } from './_sections/Loss';
import { Safety } from './_sections/Safety';
import { Statement } from './_sections/Statement';
import { TwoRights } from './_sections/TwoRights';

export const revalidate = 30;

export default function HomePage() {
  return (
    <>
      <Hero />
      <Statement />
      <Loss />
      <HowItWorks />
      <TwoRights />
      <Safety />
      <Assets />
      <LivePacks />
      <Faq />
    </>
  );
}
