import { Text, View } from "react-native";
import { tw } from "react-native-tailwindcss";

export default function Index() {
  return (
    <View style={[tw.flex1, tw.justifyCenter, tw.itemsCenter, tw.bgBlue100]}>
      <View style={[tw.p8, tw.roundedLg, tw.bgWhite, tw.shadowLg]}>
        <Text style={[tw.text2xl, tw.fontBold, tw.textBlue700, tw.mB2]}>
          Welcome to EaglePoint!
        </Text>
        <Text style={[tw.textBase, tw.textGray700]}>
          Edit <Text style={tw.fontBold}>app/index.tsx</Text> to edit this screen.
        </Text>
      </View>
    </View>
  );
}