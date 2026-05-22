import { Listing, City } from './types';
import ListingRoomFeatures from './ListingRoomFeatures';
import AddressWithMap from './AddressWithMap';
import ListingExportFields from './ListingExportFields';

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  cities: City[];
  addressError?: boolean;
  locationOnly?: boolean;
  detailsOnly?: boolean;
}

export default function ListingEditorDetailsSection({ editing, setEditing, cities, addressError, locationOnly, detailsOnly }: Props) {
  if (locationOnly) {
    return <AddressWithMap editing={editing} setEditing={setEditing} cities={cities} hasError={addressError} />;
  }
  if (detailsOnly) {
    return (
      <>
        <ListingRoomFeatures editing={editing} setEditing={setEditing} />
        <ListingExportFields editing={editing} setEditing={setEditing} />
      </>
    );
  }
  return (
    <>
      <ListingRoomFeatures editing={editing} setEditing={setEditing} />
      <AddressWithMap editing={editing} setEditing={setEditing} cities={cities} hasError={addressError} />
      <ListingExportFields editing={editing} setEditing={setEditing} />
    </>
  );
}