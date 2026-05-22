import { Listing, City } from './types';
import ListingRoomFeatures from './ListingRoomFeatures';
import AddressWithMap from './AddressWithMap';
import ListingExportFields from './ListingExportFields';

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  cities: City[];
}

export default function ListingEditorDetailsSection({ editing, setEditing, cities }: Props) {
  return (
    <>
      <ListingRoomFeatures editing={editing} setEditing={setEditing} />
      <AddressWithMap editing={editing} setEditing={setEditing} cities={cities} />
      <ListingExportFields editing={editing} setEditing={setEditing} />
    </>
  );
}
