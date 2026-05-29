import { Listing, City, LandVri } from './types';
import ListingRoomFeatures from './ListingRoomFeatures';
import AddressWithMap from './AddressWithMap';

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  cities: City[];
  landVri?: LandVri[];
  addressError?: boolean;
  locationOnly?: boolean;
  detailsOnly?: boolean;
  onCoordsManualChange?: (manual: boolean) => void;
}

export default function ListingEditorDetailsSection({ editing, setEditing, cities, landVri, addressError, locationOnly, detailsOnly, onCoordsManualChange }: Props) {
  if (locationOnly) {
    return <AddressWithMap editing={editing} setEditing={setEditing} cities={cities} hasError={addressError} onCoordsManualChange={onCoordsManualChange} />;
  }
  if (detailsOnly) {
    return <ListingRoomFeatures editing={editing} setEditing={setEditing} landVri={landVri} />;
  }
  return (
    <>
      <ListingRoomFeatures editing={editing} setEditing={setEditing} landVri={landVri} />
      <AddressWithMap editing={editing} setEditing={setEditing} cities={cities} hasError={addressError} onCoordsManualChange={onCoordsManualChange} />
    </>
  );
}