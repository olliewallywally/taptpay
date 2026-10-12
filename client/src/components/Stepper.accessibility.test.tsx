import { render, screen } from '@testing-library/react';
import Stepper, { Step } from './Stepper';

test('signup progress names contain the visible step number and label', () => {
  render(<Stepper stepLabels={['Contact', 'Business']} disableStepIndicators><Step>Contact fields</Step><Step>Business fields</Step></Stepper>);
  expect(screen.getByRole('button', { name: 'Step 1: Contact, current step' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Step 2: Business' })).toBeDisabled();
});
