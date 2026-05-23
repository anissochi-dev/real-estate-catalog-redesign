import { Listing, City } from './types';
import ListingRoomFeatures from './ListingRoomFeatures';
import AddressWithMap from './AddressWithMap';

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  cities: City[];
  addressError?: boolean;
  locationOnly?: boolean;
  detailsOnly?: boolean;
  onCoordsManualChange?: (manual: boolean) => void;
}

export default function ListingEditorDetailsSection({ editing, setEditing, cities, addressError, locationOnly, detailsOnly, onCoordsManualChange }: Props) {
  if (locationOnly) {
    return <AddressWithMap editing={editing} setEditing={setEditing} cities={cities} hasError={addressError} onCoordsManualChange={onCoordsManualChange} />;
  }
  if (detailsOnly) {
    return <ListingRoomFeatures editing={editing} setEditing={setEditing} />;
  }
  return (
    <>
      <ListingRoomFeatures editing={editing} setEditing={setEditing} />
      <AddressWithMap editing={editing} setEditing={setEditing} cities={cities} hasError={addressError} onCoordsManualChange={onCoordsManualChange} />
    </>
  );
}