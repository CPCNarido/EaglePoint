import React from 'react';
import { View, Text } from 'react-native';
import { tw } from 'react-native-tailwindcss';

export default function Admin() {
  return (
    <View style={[tw.flex1, tw.itemsCenter, tw.justifyCenter]}>
      <Text style={[tw.text2xl, tw.fontBold]}>Admin Dashboard</Text>
      <Text style={[tw.mT4]}>You are logged in as admin.</Text>
    </View>
  );
}
