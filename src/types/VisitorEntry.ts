export type VisitorEntry = {
  id: string;
  dateTimeISO: string; // stored as ISO string
  photoUri: string; // file path (managed by FileSystem)
  nameUri?: string; // file path (managed by FileSystem)
  remarksUri: string; // file path (managed by FileSystem)
  dignitaryName: string;
  personToMeet: string;
  phoneNumber: string;
  isImported?: boolean;
  hostAction?: string;
};

