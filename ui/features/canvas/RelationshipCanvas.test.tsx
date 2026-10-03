import { render, screen } from '@testing-library/react';
import { JoinEdgeLabel } from './RelationshipCanvas';

it('shows the join keys of an edge and no cardinality marker', () => {
  render(<JoinEdgeLabel keys={['session_id = session_id', 'client_id = client_id']} />);
  expect(screen.getByText('session_id = session_id')).toBeInTheDocument();
  expect(screen.getByText('client_id = client_id')).toBeInTheDocument();
  expect(screen.queryByText(/×N|\?/)).not.toBeInTheDocument();
});
