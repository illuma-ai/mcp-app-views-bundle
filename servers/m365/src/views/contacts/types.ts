/** Shapes of the Microsoft Graph contact resources the views read. Every field is optional. */

export interface ContactAddress {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  countryOrRegion?: string | null;
}

export interface Contact {
  id?: string;
  displayName?: string | null;
  givenName?: string | null;
  surname?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  emailAddresses?: Array<{ name?: string | null; address?: string | null }>;
  mobilePhone?: string | null;
  businessPhones?: Array<string | null>;
  homePhones?: Array<string | null>;
  businessAddress?: ContactAddress;
  homeAddress?: ContactAddress;
  personalNotes?: string | null;
}

/** Tool roles the contact views may call back (see actions.ts). */
export interface ContactsActions {
  contactsList?: string;
  contactGet?: string;
}
