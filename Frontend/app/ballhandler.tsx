import React from 'react';
import { View, Text } from 'react-native';
import { tw } from 'react-native-tailwindcss';

export default function BallHandler() {
  return (
    <View style={[tw.flex1, tw.itemsCenter, tw.justifyCenter]}>
      <Text style={[tw.text2xl, tw.fontBold]}>Ball Handler Dashboard</Text>
    </View>
  );
}
