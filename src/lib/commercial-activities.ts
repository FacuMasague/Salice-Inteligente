import type { CommercialActivity } from '../../shared/models';

export function partitionClientActivities(activities: CommercialActivity[]) {
  return {
    opportunities: activities.filter((activity) => activity.productIds.length > 0),
    general: activities.filter((activity) => activity.productIds.length === 0),
  };
}
