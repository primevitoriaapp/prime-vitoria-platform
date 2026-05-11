export interface TripFinancialInput {
  amount_client: number;
  amount_driver: number;
  tolls: number;
  parking: number;
  extras: number;
  discount: number;
}

export function calculateNetMargin(input: TripFinancialInput): number {
  return (input.amount_client + input.extras) - (input.amount_driver + input.tolls + input.parking + input.discount);
}
