import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { TooltipProvider } from '@owox/ui/components/tooltip';
import { connect } from '../sdk-mock';
import { ServicesProvider, servicesFromContext, type Services } from '../services';

export async function mockServices(): Promise<Services> {
  return { ...servicesFromContext(await connect()), pollIntervalMs: 0 };
}

export function renderWithServices(ui: ReactElement, services: Services) {
  return render(
    <ServicesProvider services={services}>
      <TooltipProvider>{ui}</TooltipProvider>
    </ServicesProvider>,
  );
}

export function renderUi(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}
