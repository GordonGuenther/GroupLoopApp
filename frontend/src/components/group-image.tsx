import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { DEFAULT_GROUP_IMAGES, PRIMARY } from '@/constants/group-images';

type GroupImageProps = {
  image: string;
  color: string;
  size: number;
};

/** A group's image in the group's color, with a border in that color. */
export function GroupImage({ image, color, size }: GroupImageProps) {
  const xml = (DEFAULT_GROUP_IMAGES[image] ?? DEFAULT_GROUP_IMAGES['default:1']).replaceAll(
    PRIMARY,
    color
  );
  const borderWidth = Math.max(3, size / 24);
  return (
    <View style={[styles.frame, { width: size, height: size, borderColor: color, borderWidth }]}>
      <SvgXml xml={xml} width="100%" height="100%" />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 24,
    overflow: 'hidden',
  },
});
