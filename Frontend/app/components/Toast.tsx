import React, { useEffect } from 'react';
import { View, Text, Animated } from 'react-native';

export default function Toast({ visible, title, message, duration = 2000, onClose, type = 'success' }: {
  visible: boolean;
  title?: string;
  message?: string;
  duration?: number;
  onClose?: () => void;
  type?: 'success' | 'info' | 'error';
}) {
  const anim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      const t = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => { try { onClose && onClose(); } catch (_e) { void _e; } });
      }, duration);
      return () => clearTimeout(t);
    }
  }, [visible, anim, duration, onClose]);

  if (!visible) return null;
  const bg = type === 'error' ? '#FDECEA' : type === 'info' ? '#EAF6FF' : '#EAF6EE';
  const titleColor = type === 'error' ? '#7E0000' : type === 'info' ? '#0A4670' : '#1B5E20';

  return (
    <Animated.View style={{ position: 'absolute', top: 18, right: 18, zIndex: 9999, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0,1], outputRange: [-8,0] }) }] }}>
      <View style={{ backgroundColor: bg, padding: 12, borderRadius: 8, maxWidth: 360, borderWidth: 1, borderColor: '#E6F3E3' }}>
        {title ? <Text style={{ fontWeight: '800', color: titleColor }}>{title}</Text> : null}
        {message ? <Text style={{ marginTop: 6, color: '#333' }}>{message}</Text> : null}
      </View>
    </Animated.View>
  );
}
