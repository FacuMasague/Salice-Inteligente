export interface ClientNameSource {
    name?: string | null;
    tradeName?: string | null;
}
const clean = (value?: string | null) => value?.trim().replace(/\s+/g, " ") ?? "";
const comparable = (value: string) => value.toLocaleLowerCase("es");
/** Company name: identidad principal and estable of the customer. */
export const clientPrimaryName = (client: ClientNameSource) => clean(client.name) || clean(client.tradeName) || "Customer no name";
/** Trade name, only when it adds information beyond the legal company name. */
export const clientSecondaryName = (client: ClientNameSource) => {
    const primary = clientPrimaryName(client);
    const secondary = clean(client.tradeName);
    return secondary && comparable(secondary) !== comparable(primary) ? secondary : "";
};
export const clientInitials = (client: ClientNameSource) => clientPrimaryName(client)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toLocaleUpperCase("es");
