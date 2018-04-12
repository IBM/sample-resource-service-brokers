package ibmcloud.test;

import java.util.HashSet;
import java.util.Set;

import org.apache.wink.common.WinkApplication;

public class TestResourceServiceBrokerApplication
       extends WinkApplication
{
    private static final Set<Class<?>> classes = new HashSet<Class<?>>();

    static
    {
        classes.add(TestResourceServiceBrokerResource.class);
    }

    @Override
    public Set<Class<?>> getClasses()
    {
        return classes;
    }
}